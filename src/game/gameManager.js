const { Chess } = require('chess.js');
const Match = require('../models/Match');
const User = require('../models/User');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');
const { withTransaction } = require('../utils/transaction');
const { newRatings } = require('./elo');
const { chooseMoveAsync } = require('./engineWorker');

/*
 * Authoritative game state lives here (single API instance). Clients only send intentions
 * (move e2→e4, resign, offer draw); the server validates with chess.js, runs the clocks,
 * decides results and writes Match records + ratings.
 */

const TIME_CONTROLS = {
  '1+0': [60, 0],
  '3+0': [180, 0],
  '3+2': [180, 2],
  '5+0': [300, 0],
  '10+0': [600, 0],
  '15+10': [900, 10],
};
const FIRST_MOVE_MS = 30 * 1000;
const RECONNECT_GRACE_MS = 60 * 1000;
const ENDED_GAME_TTL_MS = 60 * 1000;
const COMPUTER_DELAY_MS = 400;

const games = new Map(); // gameId -> game
const userGame = new Map(); // userId -> gameId (active games only)
const queue = []; // matchmaking entries
const disconnectTimers = new Map(); // userId -> timeout
let io = null;
let matcher = null;

const other = (color) => (color === 'w' ? 'b' : 'w');
const sideKey = (color) => (color === 'w' ? 'white' : 'black');

function init(ioInstance, { config } = {}) {
  io = ioInstance;
  if (config) Object.assign(settings, config);
  if (!matcher) matcher = setInterval(matchQueue, 2000);
  matcher.unref();
}

// Overridable in tests
const settings = { firstMoveMs: FIRST_MOVE_MS, reconnectGraceMs: RECONNECT_GRACE_MS, computerDelayMs: COMPUTER_DELAY_MS };

function emitToUser(userId, event, payload) {
  if (io && userId) io.to(`user:${userId}`).emit(event, payload);
}

function emitToGame(game, event, payload) {
  if (io) io.to(`game:${game.id}`).emit(event, payload);
}

function liveClocks(game) {
  if (!game.clocks) return null;
  const clocks = { ...game.clocks };
  const turn = game.chess.turn();
  if (game.status === 'ACTIVE' && clocksRunning(game)) {
    clocks[turn] = Math.max(0, clocks[turn] - (Date.now() - game.turnStartedAt));
  }
  return { white: clocks.w, black: clocks.b };
}

// Clocks start after both players have made their first move
function clocksRunning(game) {
  return Boolean(game.clocks) && game.chess.history().length >= 2;
}

function publicSide(side) {
  return { userId: side.userId, displayName: side.displayName, rating: side.rating, isComputer: Boolean(side.isComputer) };
}

function stateFor(game, userId) {
  const history = game.chess.history({ verbose: true });
  const last = history[history.length - 1];
  return {
    gameId: game.id,
    mode: game.mode,
    timeControl: game.timeControl,
    white: publicSide(game.white),
    black: publicSide(game.black),
    yourColor: colorOf(game, userId),
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    moves: history.map((m) => m.san),
    lastMove: last ? { from: last.from, to: last.to } : null,
    clocks: liveClocks(game),
    clocksRunning: clocksRunning(game),
    status: game.status,
    result: game.result || null,
    termination: game.termination || null,
    drawOfferBy: game.drawOfferBy || null,
    serverTime: Date.now(),
  };
}

function colorOf(game, userId) {
  if (!userId) return null;
  if (game.white.userId === String(userId)) return 'w';
  if (game.black.userId === String(userId)) return 'b';
  return null;
}

function humans(game) {
  return [game.white, game.black].filter((s) => !s.isComputer).map((s) => s.userId);
}

function getGame(gameId, userId) {
  const game = games.get(gameId);
  if (!game) throw AppError.notFound('Game not found', 'GAME_NOT_FOUND');
  const color = colorOf(game, userId);
  if (!color) throw AppError.forbidden('You are not a player in this game', 'NOT_IN_GAME');
  return { game, color };
}

function activeGameIdFor(userId) {
  return userGame.get(String(userId)) || null;
}

function clearTimer(game, name) {
  if (game.timers[name]) clearTimeout(game.timers[name]);
  game.timers[name] = null;
}

// ---- Game lifecycle ----

async function createGame({ white, black, mode, timeControl }) {
  const startedAt = new Date();
  const match = await Match.create({
    white: { userId: white.userId, displayName: white.displayName, ratingBefore: white.rating },
    black: { userId: black.userId, displayName: black.displayName, ratingBefore: black.rating },
    mode,
    timeControl,
    status: 'ONGOING',
    startedAt,
  });

  const initialMs = timeControl.initialSeconds * 1000;
  const game = {
    id: String(match._id),
    mode,
    timeControl,
    white,
    black,
    chess: new Chess(),
    clocks: initialMs > 0 ? { w: initialMs, b: initialMs } : null,
    turnStartedAt: Date.now(),
    status: 'ACTIVE',
    drawOfferBy: null,
    timers: { flag: null, abort: null },
  };
  games.set(game.id, game);

  for (const userId of humans(game)) {
    userGame.set(userId, game.id);
    if (io) io.in(`user:${userId}`).socketsJoin(`game:${game.id}`);
    emitToUser(userId, 'game:start', stateFor(game, userId));
  }
  armFirstMoveTimer(game);
  if (game.white.isComputer) scheduleComputer(game);
  return game;
}

function armFirstMoveTimer(game) {
  clearTimer(game, 'abort');
  if (game.chess.history().length >= 2) return;
  const toMove = game.chess.turn();
  if (game[sideKey(toMove)].isComputer) return;
  game.timers.abort = setTimeout(() => {
    finish(game, 'ABORTED', null).catch((err) => logger.error({ err }, 'abort failed'));
  }, settings.firstMoveMs);
}

function armFlagTimer(game) {
  clearTimer(game, 'flag');
  if (!clocksRunning(game)) return;
  const color = game.chess.turn();
  game.timers.flag = setTimeout(() => onFlag(game, color), game.clocks[color] + 50);
}

function hasMatingMaterial(chess, color) {
  let minors = 0;
  for (const row of chess.board()) {
    for (const p of row) {
      if (!p || p.color !== color || p.type === 'k') continue;
      if (p.type === 'p' || p.type === 'r' || p.type === 'q') return true;
      minors += 1;
    }
  }
  return minors >= 2;
}

function onFlag(game, color) {
  if (game.status !== 'ACTIVE' || game.chess.turn() !== color) return;
  const left = game.clocks[color] - (Date.now() - game.turnStartedAt);
  if (left > 0) {
    armFlagTimer(game);
    return;
  }
  game.clocks[color] = 0;
  // Running out of time is a draw if the opponent cannot possibly mate
  const result = hasMatingMaterial(game.chess, other(color)) ? (color === 'w' ? 'BLACK_WIN' : 'WHITE_WIN') : 'DRAW';
  finish(game, result, 'TIMEOUT').catch((err) => logger.error({ err }, 'flag finish failed'));
}

function gameOverReason(chess) {
  if (chess.isCheckmate()) return { result: chess.turn() === 'w' ? 'BLACK_WIN' : 'WHITE_WIN', termination: 'CHECKMATE' };
  if (chess.isStalemate()) return { result: 'DRAW', termination: 'STALEMATE' };
  if (chess.isInsufficientMaterial()) return { result: 'DRAW', termination: 'INSUFFICIENT_MATERIAL' };
  if (chess.isThreefoldRepetition()) return { result: 'DRAW', termination: 'REPETITION' };
  if (chess.isDrawByFiftyMoves()) return { result: 'DRAW', termination: 'FIFTY_MOVE' };
  return null;
}

async function applyMove(game, input) {
  const color = game.chess.turn();
  const now = Date.now();
  const running = clocksRunning(game);

  if (running) {
    game.clocks[color] -= now - game.turnStartedAt;
    if (game.clocks[color] <= 0) {
      onFlag(game, color);
      throw AppError.conflict('Your time ran out', 'TIME_OUT');
    }
  }

  let move;
  try {
    move = game.chess.move({ from: input.from, to: input.to, promotion: input.promotion });
  } catch {
    if (running) game.clocks[color] += now - game.turnStartedAt; // illegal attempt costs no time
    throw AppError.unprocessable('Illegal move', 'ILLEGAL_MOVE');
  }

  if (running) game.clocks[color] += game.timeControl.incrementSeconds * 1000;
  game.turnStartedAt = now;
  game.drawOfferBy = null;

  emitToGame(game, 'game:move', {
    gameId: game.id,
    move: { from: move.from, to: move.to, san: move.san, promotion: move.promotion || null, color },
    fen: game.chess.fen(),
    turn: game.chess.turn(),
    ply: game.chess.history().length,
    clocks: liveClocks(game),
    clocksRunning: clocksRunning(game),
    serverTime: now,
  });

  const over = gameOverReason(game.chess);
  if (over) {
    await finish(game, over.result, over.termination);
    return move;
  }
  armFirstMoveTimer(game);
  armFlagTimer(game);
  if (game[sideKey(game.chess.turn())].isComputer) scheduleComputer(game);
  return move;
}

function scheduleComputer(game) {
  const side = game[sideKey(game.chess.turn())];
  const ply = game.chess.history().length;
  setTimeout(async () => {
    if (game.status !== 'ACTIVE' || game.chess.history().length !== ply) return;
    try {
      const move = await chooseMoveAsync(game.chess.fen(), side.level);
      if (game.status !== 'ACTIVE' || game.chess.history().length !== ply) return;
      await applyMove(game, move);
    } catch (err) {
      logger.error({ err, gameId: game.id }, 'Computer move failed');
    }
  }, settings.computerDelayMs);
}

async function finish(game, result, termination) {
  if (game.status !== 'ACTIVE') return;
  game.status = 'ENDED';
  game.result = result;
  game.termination = termination;
  clearTimer(game, 'flag');
  clearTimer(game, 'abort');

  const aborted = result === 'ABORTED';
  const rated = game.mode === 'RATED' && !aborted;
  let after = null;
  if (rated) {
    const whiteScore = result === 'WHITE_WIN' ? 1 : result === 'DRAW' ? 0.5 : 0;
    after = newRatings(game.white.rating, game.black.rating, whiteScore);
  }
  const winnerColor = result === 'WHITE_WIN' ? 'w' : result === 'BLACK_WIN' ? 'b' : null;
  const winner = winnerColor ? game[sideKey(winnerColor)] : null;

  try {
    await withTransaction(async (session) => {
      const set = {
        status: aborted ? 'ABORTED' : 'COMPLETED',
        result,
        moveCount: game.chess.history().length,
        pgn: game.chess.pgn(),
        endedAt: new Date(),
      };
      if (termination) set.termination = termination;
      if (winner && winner.userId) set.winnerId = winner.userId;
      if (after) {
        set['white.ratingAfter'] = after.white;
        set['black.ratingAfter'] = after.black;
      }
      await Match.updateOne({ _id: game.id }, { $set: set }, { session });
      if (after) {
        for (const [side, rating] of [[game.white, after.white], [game.black, after.black]]) {
          await User.updateOne({ _id: side.userId }, { $set: { rating }, $max: { peakRating: rating } }, { session });
        }
      }
    });
  } catch (err) {
    logger.error({ err, gameId: game.id }, 'Failed to persist game result');
  }

  emitToGame(game, 'game:end', {
    gameId: game.id,
    result,
    termination,
    winner: winnerColor,
    pgn: game.chess.pgn(),
    ratings: after
      ? {
          white: { before: game.white.rating, after: after.white },
          black: { before: game.black.rating, after: after.black },
        }
      : null,
  });

  for (const userId of humans(game)) {
    if (userGame.get(userId) === game.id) userGame.delete(userId);
    const t = disconnectTimers.get(userId);
    if (t) clearTimeout(t);
    disconnectTimers.delete(userId);
  }
  setTimeout(() => games.delete(game.id), ENDED_GAME_TTL_MS).unref();
}

// ---- Player actions ----

async function move(userId, gameId, input) {
  const { game, color } = getGame(gameId, userId);
  if (game.status !== 'ACTIVE') throw AppError.conflict('Game is over', 'GAME_OVER');
  if (game.chess.turn() !== color) throw AppError.conflict('Not your turn', 'NOT_YOUR_TURN');
  const m = await applyMove(game, input);
  return { san: m.san };
}

async function resign(userId, gameId) {
  const { game, color } = getGame(gameId, userId);
  if (game.status !== 'ACTIVE') throw AppError.conflict('Game is over', 'GAME_OVER');
  if (game.chess.history().length < 2) return finish(game, 'ABORTED', null);
  return finish(game, color === 'w' ? 'BLACK_WIN' : 'WHITE_WIN', 'RESIGNATION');
}

async function abort(userId, gameId) {
  const { game } = getGame(gameId, userId);
  if (game.status !== 'ACTIVE') throw AppError.conflict('Game is over', 'GAME_OVER');
  if (game.chess.history().length >= 2) throw AppError.conflict('Game can no longer be aborted', 'CANNOT_ABORT');
  return finish(game, 'ABORTED', null);
}

function offerDraw(userId, gameId) {
  const { game, color } = getGame(gameId, userId);
  if (game.status !== 'ACTIVE') throw AppError.conflict('Game is over', 'GAME_OVER');
  if (game[sideKey(other(color))].isComputer) throw AppError.conflict('The computer declines draws', 'DRAW_DECLINED');
  if (game.drawOfferBy === other(color)) return finish(game, 'DRAW', 'AGREEMENT');
  game.drawOfferBy = color;
  emitToGame(game, 'game:drawOffer', { gameId: game.id, by: color });
  return null;
}

async function respondDraw(userId, gameId, accept) {
  const { game, color } = getGame(gameId, userId);
  if (game.status !== 'ACTIVE') throw AppError.conflict('Game is over', 'GAME_OVER');
  if (game.drawOfferBy !== other(color)) throw AppError.conflict('No draw offer to answer', 'NO_DRAW_OFFER');
  if (accept) return finish(game, 'DRAW', 'AGREEMENT');
  game.drawOfferBy = null;
  emitToGame(game, 'game:drawDeclined', { gameId: game.id, by: color });
  return null;
}

function sync(userId, gameId) {
  const { game } = getGame(gameId, userId);
  return stateFor(game, userId);
}

function startComputerGame(user, { level, color }) {
  if (activeGameIdFor(user._id)) throw AppError.conflict('Finish your current game first', 'ALREADY_IN_GAME');
  leaveQueue(user._id);
  const me = { userId: String(user._id), displayName: user.displayName, rating: user.rating };
  const bot = { userId: null, displayName: `Computer (Level ${level})`, rating: null, isComputer: true, level };
  const playWhite = color === 'random' ? Math.random() < 0.5 : color === 'white';
  return createGame({
    white: playWhite ? me : bot,
    black: playWhite ? bot : me,
    mode: 'VS_COMPUTER',
    timeControl: { initialSeconds: 0, incrementSeconds: 0, label: 'Untimed' },
  });
}

// ---- Matchmaking ----

function joinQueue(user, timeControlKey) {
  const tc = TIME_CONTROLS[timeControlKey];
  if (!tc) throw AppError.unprocessable('Unknown time control', 'INVALID_TIME_CONTROL');
  if (activeGameIdFor(user._id)) throw AppError.conflict('Finish your current game first', 'ALREADY_IN_GAME');
  leaveQueue(user._id);
  queue.push({
    userId: String(user._id),
    displayName: user.displayName,
    rating: user.rating,
    timeControl: timeControlKey,
    joinedAt: Date.now(),
  });
  emitToUser(String(user._id), 'queue:joined', { timeControl: timeControlKey });
  matchQueue();
}

function leaveQueue(userId) {
  const i = queue.findIndex((e) => e.userId === String(userId));
  if (i >= 0) queue.splice(i, 1);
  return i >= 0;
}

// Rating window widens the longer a player waits
function ratingWindow(entry) {
  return Math.min(1000, 150 + 50 * Math.floor((Date.now() - entry.joinedAt) / 1000));
}

function matchQueue() {
  for (let i = 0; i < queue.length; i += 1) {
    for (let j = i + 1; j < queue.length; j += 1) {
      const a = queue[i];
      const b = queue[j];
      if (a.timeControl !== b.timeControl) continue;
      const diff = Math.abs(a.rating - b.rating);
      if (diff > ratingWindow(a) || diff > ratingWindow(b)) continue;

      queue.splice(j, 1);
      queue.splice(i, 1);
      const [initialSeconds, incrementSeconds] = TIME_CONTROLS[a.timeControl];
      const [white, black] = Math.random() < 0.5 ? [a, b] : [b, a];
      createGame({
        white: { userId: white.userId, displayName: white.displayName, rating: white.rating },
        black: { userId: black.userId, displayName: black.displayName, rating: black.rating },
        mode: 'RATED',
        timeControl: { initialSeconds, incrementSeconds, label: a.timeControl },
      }).catch((err) => logger.error({ err }, 'Failed to create game'));
      i -= 1;
      break;
    }
  }
}

// ---- Connections ----

function onConnect(socket, user) {
  const userId = String(user._id);
  const timer = disconnectTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    disconnectTimers.delete(userId);
  }
  const gameId = activeGameIdFor(userId);
  if (gameId && games.has(gameId)) {
    const game = games.get(gameId);
    socket.join(`game:${gameId}`);
    socket.emit('game:state', stateFor(game, userId));
    if (timer) socket.to(`game:${gameId}`).emit('game:opponentReconnected', { gameId, color: colorOf(game, userId) });
  }
}

async function onDisconnect(user) {
  const userId = String(user._id);
  if (io) {
    const remaining = await io.in(`user:${userId}`).fetchSockets();
    if (remaining.length > 0) return;
  }
  leaveQueue(userId);
  const gameId = activeGameIdFor(userId);
  const game = gameId && games.get(gameId);
  if (!game || game.status !== 'ACTIVE') return;

  const color = colorOf(game, userId);
  emitToGame(game, 'game:opponentDisconnected', {
    gameId,
    color,
    timeoutSeconds: Math.round(settings.reconnectGraceMs / 1000),
  });
  disconnectTimers.set(
    userId,
    setTimeout(() => {
      disconnectTimers.delete(userId);
      if (game.status !== 'ACTIVE') return;
      const result = game.chess.history().length < 2 ? 'ABORTED' : color === 'w' ? 'BLACK_WIN' : 'WHITE_WIN';
      finish(game, result, result === 'ABORTED' ? null : 'ABANDONED').catch((err) => logger.error({ err }, 'abandon failed'));
    }, settings.reconnectGraceMs),
  );
}

// Games are in memory, so anything still ONGOING after a restart cannot continue
async function abortStaleMatches() {
  const res = await Match.updateMany(
    { status: 'ONGOING' },
    { $set: { status: 'ABORTED', result: 'ABORTED', endedAt: new Date() } },
  );
  if (res.modifiedCount) logger.warn(`Aborted ${res.modifiedCount} games interrupted by restart`);
}

function reset() {
  for (const game of games.values()) {
    clearTimer(game, 'flag');
    clearTimer(game, 'abort');
  }
  for (const t of disconnectTimers.values()) clearTimeout(t);
  games.clear();
  userGame.clear();
  disconnectTimers.clear();
  queue.length = 0;
  if (matcher) clearInterval(matcher);
  matcher = null;
}

module.exports = {
  TIME_CONTROLS,
  init,
  reset,
  move,
  resign,
  abort,
  offerDraw,
  respondDraw,
  sync,
  startComputerGame,
  joinQueue,
  leaveQueue,
  activeGameIdFor,
  onConnect,
  onDisconnect,
  abortStaleMatches,
};
