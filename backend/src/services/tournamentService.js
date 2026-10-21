const crypto = require('crypto');
const Tournament = require('../models/Tournament');
const User = require('../models/User');
const PlatformFee = require('../models/PlatformFee');
const walletService = require('./walletService');
const { audit } = require('./auditService');
const { getSettings, feeFor } = require('./settingsService');
const gameManager = require('../game/gameManager');
const AppError = require('../utils/AppError');
const { isObjectId } = require('../utils/http');
const { withTransaction } = require('../utils/transaction');
const logger = require('../utils/logger');

const MAX_DRAWS_BEFORE_TIEBREAK = 3;
const CHECK_INTERVAL_MS = 15 * 1000;

let io = null;
let checker = null;

// All tournament state changes run one at a time (low volume, avoids read-modify-write races)
let chain = Promise.resolve();
function serialize(fn) {
  const run = chain.then(fn);
  chain = run.catch(() => {});
  return run;
}

function notify(t) {
  if (!io) return;
  for (const p of t.players) io.to(`user:${p.userId}`).emit('tournament:update', { tournamentId: String(t._id), status: t.status });
}

async function load(id) {
  if (!isObjectId(String(id))) throw AppError.notFound('Tournament not found', 'TOURNAMENT_NOT_FOUND');
  const t = await Tournament.findById(id);
  if (!t) throw AppError.notFound('Tournament not found', 'TOURNAMENT_NOT_FOUND');
  return t;
}

const sameId = (a, b) => a && b && String(a) === String(b);
const currentRound = (t) => t.rounds[t.rounds.length - 1];

// Standard bracket order so the top seeds can only meet late: 1v8, 4v5, 2v7, 3v6 ...
function bracketOrder(size) {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order;
}

function side(player) {
  return player ? { userId: player.userId, displayName: player.displayName, seed: player.seed } : null;
}

function makeRound(t, entrants) {
  const now = new Date();
  const pairings = [];
  for (let i = 0; i < entrants.length; i += 2) {
    const a = entrants[i];
    const b = entrants[i + 1] || null;
    const pairing = { a: side(a), b: side(b), status: 'WAITING', readyUserIds: [], gameIds: [], draws: 0 };
    if (!a || !b) {
      pairing.status = 'DONE';
      pairing.winnerId = (a || b).userId;
      pairing.decidedBy = 'BYE';
    }
    pairings.push(pairing);
  }
  t.rounds.push({
    number: t.rounds.length + 1,
    startedAt: now,
    deadlineAt: new Date(now.getTime() + t.roundMinutes * 60 * 1000),
    pairings,
  });
}

// ---------- Admin ----------

async function create(data, admin) {
  const settings = await getSettings();
  const t = await Tournament.create({ ...data, feePercent: settings.winningsFeePercent, createdBy: admin._id });
  return t;
}

async function cancel(id, reason, req) {
  return serialize(async () => {
    const t = await load(id);
    if (!['REGISTRATION', 'RUNNING'].includes(t.status)) throw AppError.conflict('Tournament is already finished', 'TOURNAMENT_CLOSED');
    await withTransaction(async (session) => {
      for (const p of t.players) {
        if (t.entryFee > 0) {
          await walletService.credit(
            {
              userId: p.userId,
              amount: t.entryFee,
              coinType: 'TOURNAMENT',
              type: 'TOURNAMENT_REFUND',
              refType: 'TOURNAMENT',
              refId: String(t._id),
              idempotencyKey: `trefund:${t._id}:${p.userId}`,
              description: `Refund: ${t.name} was cancelled`,
            },
            session,
          );
        }
      }
      t.status = 'CANCELLED';
      t.cancelReason = reason;
      await t.save({ session });
    });
    if (req) await audit(req, { action: 'TOURNAMENT_CANCELLED', targetType: 'TOURNAMENT', targetId: t._id, metadata: { reason, refunded: t.players.length } });
    notify(t);
    return t;
  });
}

async function startNow(id, req) {
  return serialize(async () => {
    const t = await load(id);
    if (t.status !== 'REGISTRATION') throw AppError.conflict('Tournament has already started', 'TOURNAMENT_STARTED');
    if (t.players.length < 2) throw AppError.conflict('At least 2 players are needed to start', 'NOT_ENOUGH_PLAYERS');
    await begin(t);
    if (req) await audit(req, { action: 'TOURNAMENT_STARTED', targetType: 'TOURNAMENT', targetId: t._id, metadata: { players: t.players.length } });
    return t;
  });
}

// ---------- Players ----------

async function join(user, id) {
  return serialize(async () => {
    const t = await load(id);
    if (t.status !== 'REGISTRATION') throw AppError.conflict('Registration is closed', 'REGISTRATION_CLOSED');
    if (t.players.some((p) => sameId(p.userId, user._id))) throw AppError.conflict('You have already joined', 'ALREADY_JOINED');
    if (t.players.length >= t.maxPlayers) throw AppError.conflict('Tournament is full', 'TOURNAMENT_FULL');

    await withTransaction(async (session) => {
      if (t.entryFee > 0) {
        await walletService.debit(
          {
            userId: user._id,
            amount: t.entryFee,
            coinType: 'TOURNAMENT',
            type: 'TOURNAMENT_ENTRY',
            refType: 'TOURNAMENT',
            refId: String(t._id),
            idempotencyKey: `tentry:${t._id}:${user._id}:${crypto.randomUUID()}`,
            description: `Entry: ${t.name}`,
          },
          session,
        );
      }
      t.players.push({ userId: user._id, displayName: user.displayName, rating: user.rating });
      t.prizePool += t.entryFee;
      await t.save({ session });
    });

    if (t.players.length >= t.maxPlayers) await begin(t);
    else notify(t);
    return t;
  });
}

async function leave(user, id) {
  return serialize(async () => {
    const t = await load(id);
    if (t.status !== 'REGISTRATION') throw AppError.conflict('You can only leave before the tournament starts', 'TOURNAMENT_STARTED');
    const index = t.players.findIndex((p) => sameId(p.userId, user._id));
    if (index < 0) throw AppError.conflict('You have not joined this tournament', 'NOT_JOINED');

    await withTransaction(async (session) => {
      if (t.entryFee > 0) {
        await walletService.credit(
          {
            userId: user._id,
            amount: t.entryFee,
            coinType: 'TOURNAMENT',
            type: 'TOURNAMENT_REFUND',
            refType: 'TOURNAMENT',
            refId: String(t._id),
            idempotencyKey: `tleave:${t._id}:${user._id}:${crypto.randomUUID()}`,
            description: `Left ${t.name}`,
          },
          session,
        );
      }
      t.players.splice(index, 1);
      t.prizePool -= t.entryFee;
      await t.save({ session });
    });
    notify(t);
    return t;
  });
}

// Both players tap Ready; the game starts when both are ready and online
async function ready(user, id) {
  return serialize(async () => {
    const t = await load(id);
    if (t.status !== 'RUNNING') throw AppError.conflict('Tournament is not running', 'TOURNAMENT_NOT_RUNNING');
    const round = currentRound(t);
    const pairing = round.pairings.find((p) => sameId(p.a?.userId, user._id) || sameId(p.b?.userId, user._id));
    if (!pairing) throw AppError.conflict('You have no game in this round', 'NO_PAIRING');
    if (pairing.status === 'DONE') throw AppError.conflict('Your match in this round is finished', 'PAIRING_DONE');
    if (pairing.status === 'PLAYING') return t;

    if (!pairing.readyUserIds.some((u) => sameId(u, user._id))) pairing.readyUserIds.push(user._id);
    const bothReady = [pairing.a.userId, pairing.b.userId].every((uid) => pairing.readyUserIds.some((r) => sameId(r, uid)));
    if (bothReady) {
      const busy = [pairing.a, pairing.b].find((s) => gameManager.activeGameIdFor(s.userId));
      if (!busy) await startPairingGame(t, pairing);
    }
    await t.save();
    notify(t);
    return t;
  });
}

async function startPairingGame(t, pairing) {
  // Higher seed is White in the first game; colours alternate on replays
  const [first, second] = pairing.a.seed <= pairing.b.seed ? [pairing.a, pairing.b] : [pairing.b, pairing.a];
  const [white, black] = pairing.gameIds.length % 2 === 0 ? [first, second] : [second, first];
  const users = await User.find({ _id: { $in: [white.userId, black.userId] } }).select('rating displayName');
  const ratingOf = (uid) => users.find((u) => sameId(u._id, uid))?.rating ?? null;
  const game = await gameManager.createGame({
    white: { userId: String(white.userId), displayName: white.displayName, rating: ratingOf(white.userId) },
    black: { userId: String(black.userId), displayName: black.displayName, rating: ratingOf(black.userId) },
    mode: 'TOURNAMENT',
    timeControl: t.timeControl,
    tournament: { tournamentId: String(t._id), pairingId: String(pairing._id) },
  });
  pairing.status = 'PLAYING';
  pairing.currentGameId = game.id;
  pairing.gameIds.push(game.id);
}

// ---------- Progress ----------

async function begin(t) {
  // Seed by rating (highest = seed 1), then place into a power-of-two bracket with byes
  const players = [...t.players].sort((x, y) => (y.rating || 0) - (x.rating || 0));
  players.forEach((p, i) => {
    t.players.find((q) => sameId(q.userId, p.userId)).seed = i + 1;
  });
  let size = 2;
  while (size < players.length) size *= 2;
  const bySeed = (s) => t.players.find((p) => p.seed === s) || null;
  const entrants = bracketOrder(size).map(bySeed);
  t.status = 'RUNNING';
  makeRound(t, entrants);
  await advanceIfRoundComplete(t);
  await t.save();
  notify(t);
}

function decide(pairing, winnerId, decidedBy) {
  pairing.status = 'DONE';
  pairing.winnerId = winnerId;
  pairing.decidedBy = decidedBy;
  pairing.currentGameId = null;
}

function higherSeed(pairing) {
  return pairing.a.seed <= pairing.b.seed ? pairing.a.userId : pairing.b.userId;
}

async function advanceIfRoundComplete(t) {
  const round = currentRound(t);
  if (!round || round.pairings.some((p) => p.status !== 'DONE')) return;

  for (const p of round.pairings) {
    for (const s of [p.a, p.b]) {
      if (s && !sameId(s.userId, p.winnerId)) {
        const entrant = t.players.find((q) => sameId(q.userId, s.userId));
        if (entrant) entrant.eliminatedInRound = round.number;
      }
    }
  }

  const winners = round.pairings.map((p) => t.players.find((q) => sameId(q.userId, p.winnerId)));
  if (winners.length === 1) {
    await complete(t);
    return;
  }
  makeRound(t, winners);
  // A new round can be fully decided by byes only in degenerate cases; recurse safely
  await advanceIfRoundComplete(t);
}

async function complete(t) {
  const finalRound = currentRound(t);
  const final = finalRound.pairings[0];
  const champion = final.winnerId;
  const runnerUp = [final.a, final.b].find((s) => s && !sameId(s.userId, champion))?.userId;
  const semiLosers =
    t.rounds.length >= 2
      ? t.rounds[t.rounds.length - 2].pairings
          .map((p) => [p.a, p.b].find((s) => s && !sameId(s.userId, p.winnerId))?.userId)
          .filter(Boolean)
      : [];

  const fee = feeFor(t.prizePool, t.feePercent);
  const net = t.prizePool - fee;
  const places = [
    { place: 1, users: [champion], pct: t.prizeSplit[0] || 0 },
    { place: 2, users: runnerUp ? [runnerUp] : [], pct: t.prizeSplit[1] || 0 },
    { place: 3, users: semiLosers, pct: t.prizeSplit[2] || 0 },
  ];
  const payouts = [];
  for (const { place, users, pct } of places) {
    if (!users.length || !pct) continue;
    const each = Math.floor((net * pct) / 100 / users.length);
    for (const uid of users) {
      if (each > 0) payouts.push({ userId: uid, place, coins: each, displayName: t.players.find((p) => sameId(p.userId, uid))?.displayName });
    }
  }
  // Coins left over from rounding (or unawarded places) stay with the platform
  const paid = payouts.reduce((s, p) => s + p.coins, 0);
  const platformCoins = t.prizePool - paid;

  await withTransaction(async (session) => {
    for (const p of payouts) {
      await walletService.credit(
        {
          userId: p.userId,
          amount: p.coins,
          type: 'TOURNAMENT_PRIZE',
          refType: 'TOURNAMENT',
          refId: String(t._id),
          idempotencyKey: `tprize:${t._id}:${p.userId}`,
          description: `${['', '1st', '2nd', '3rd–4th'][p.place]} place in ${t.name}`,
        },
        session,
      );
    }
    if (platformCoins > 0) {
      await PlatformFee.create(
        [{
          source: 'TOURNAMENT',
          coins: platformCoins,
          feePercent: t.feePercent,
          grossCoins: t.prizePool,
          refType: 'TOURNAMENT',
          refId: String(t._id),
          userIds: t.players.map((p) => p.userId),
        }],
        { session },
      );
    }
    t.status = 'COMPLETED';
    t.winnerId = champion;
    t.feeCoins = platformCoins;
    t.payouts = payouts;
    t.completedAt = new Date();
    await t.save({ session });
  });
}

async function handleGameFinished({ gameId, tournament, winnerUserId }) {
  if (!tournament) return;
  await serialize(async () => {
    const t = await Tournament.findById(tournament.tournamentId);
    if (!t || t.status !== 'RUNNING') return;
    const pairing = currentRound(t).pairings.id(tournament.pairingId);
    if (!pairing || pairing.currentGameId !== gameId) return;

    if (winnerUserId) {
      decide(pairing, winnerUserId, 'GAME');
    } else {
      pairing.draws += 1;
      if (pairing.draws >= MAX_DRAWS_BEFORE_TIEBREAK) {
        decide(pairing, higherSeed(pairing), 'TIEBREAK');
      } else {
        // Replay with colours swapped; both players tap Ready again
        pairing.status = 'WAITING';
        pairing.readyUserIds = [];
        pairing.currentGameId = null;
      }
    }
    await advanceIfRoundComplete(t);
    await t.save();
    notify(t);
  });
}

// Starts tournaments at their start time and applies forfeits when a round's time is up
async function tick() {
  const now = new Date();
  const due = await Tournament.find({ status: 'REGISTRATION', startsAt: { $lte: now } }).select('_id');
  for (const { _id } of due) {
    await serialize(async () => {
      const t = await Tournament.findById(_id);
      if (!t || t.status !== 'REGISTRATION') return;
      if (t.players.length >= 2) await begin(t);
    }).catch((err) => logger.error({ err }, 'tournament start failed'));
    const t = await Tournament.findById(_id);
    if (t && t.status === 'REGISTRATION' && t.players.length < 2) {
      await cancel(_id, 'Not enough players').catch((err) => logger.error({ err }, 'tournament cancel failed'));
    }
  }

  const running = await Tournament.find({ status: 'RUNNING' }).select('_id');
  for (const { _id } of running) {
    await serialize(async () => {
      const t = await Tournament.findById(_id);
      if (!t || t.status !== 'RUNNING') return;
      const round = currentRound(t);
      let changed = false;
      for (const pairing of round.pairings) {
        if (pairing.status === 'PLAYING' && pairing.currentGameId && !gameManager.isGameLive(pairing.currentGameId)) {
          // Game was lost (server restart): let the players start it again
          pairing.status = 'WAITING';
          pairing.readyUserIds = [];
          pairing.currentGameId = null;
          changed = true;
        }
        if (pairing.status === 'WAITING' && round.deadlineAt <= now) {
          const readyIds = pairing.readyUserIds.map(String);
          const present = [pairing.a, pairing.b].filter((s) => readyIds.includes(String(s.userId)));
          decide(pairing, present.length === 1 ? present[0].userId : higherSeed(pairing), present.length === 1 ? 'FORFEIT' : 'TIEBREAK');
          changed = true;
        }
      }
      if (changed) {
        await advanceIfRoundComplete(t);
        await t.save();
        notify(t);
      }
    }).catch((err) => logger.error({ err }, 'tournament tick failed'));
  }
}

function init(ioInstance) {
  io = ioInstance;
  gameManager.onGameFinished(handleGameFinished);
  if (!checker) {
    checker = setInterval(() => tick().catch((err) => logger.error({ err }, 'tournament tick failed')), CHECK_INTERVAL_MS);
    checker.unref();
  }
}

function stop() {
  if (checker) clearInterval(checker);
  checker = null;
}

// What a player needs to see: their pairing in the current round, ready state, etc.
function viewFor(t, userId) {
  const json = t.toJSON();
  const joined = t.players.some((p) => sameId(p.userId, userId));
  const round = currentRound(t);
  const myPairing = round?.pairings.find((p) => sameId(p.a?.userId, userId) || sameId(p.b?.userId, userId));
  const entrant = t.players.find((p) => sameId(p.userId, userId));
  return {
    ...json,
    playerCount: t.players.length,
    joined,
    eliminated: Boolean(entrant?.eliminatedInRound),
    myPairing: myPairing
      ? {
          id: String(myPairing._id),
          round: round.number,
          deadlineAt: round.deadlineAt,
          status: myPairing.status,
          opponent: sameId(myPairing.a?.userId, userId) ? myPairing.b : myPairing.a,
          iAmReady: myPairing.readyUserIds.some((r) => sameId(r, userId)),
          opponentReady: myPairing.readyUserIds.some((r) => !sameId(r, userId)),
          currentGameId: myPairing.currentGameId || null,
          winnerId: myPairing.winnerId ? String(myPairing.winnerId) : null,
          draws: myPairing.draws,
        }
      : null,
  };
}

module.exports = {
  init,
  stop,
  tick,
  create,
  cancel,
  startNow,
  join,
  leave,
  ready,
  viewFor,
  handleGameFinished,
  bracketOrder,
};
