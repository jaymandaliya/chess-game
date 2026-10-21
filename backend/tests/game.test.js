const http = require('http');
const { io: connectClient } = require('socket.io-client');
const Match = require('../src/models/Match');
const User = require('../src/models/User');
const { attachSocket } = require('../src/game/socket');
const manager = require('../src/game/gameManager');
const { app, api, startDb, stopDb, resetDb, asUser } = require('./helpers');

const FAST = { firstMoveMs: 600, reconnectGraceMs: 400, computerDelayMs: 10 };
let server;
let io;
let url;
const sockets = [];

beforeAll(async () => {
  await startDb();
  server = http.createServer(app);
  io = attachSocket(server, { config: FAST });
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  manager.reset();
  io.close();
  await new Promise((resolve) => server.close(resolve));
  await stopDb();
});

beforeEach(async () => {
  await resetDb();
  manager.reset();
  manager.init(io, { config: FAST });
});

afterEach(() => {
  while (sockets.length) sockets.pop().disconnect();
});

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = connectClient(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    s.once('connect', () => resolve(s));
    s.once('connect_error', reject);
  });
}

function call(socket, event, payload) {
  return new Promise((resolve) => socket.emit(event, payload, resolve));
}

function waitFor(socket, event, predicate = () => true, timeoutMs = 5000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`timeout waiting for ${event}`)), timeoutMs);
    const listener = (data) => {
      if (!predicate(data)) return;
      clearTimeout(timer);
      socket.off(event, listener);
      resolve(data);
    };
    socket.on(event, listener);
  });
}

// Two players queue for the same time control and get paired
async function pairedGame() {
  const p1 = await asUser();
  const p2 = await asUser();
  const s1 = await connect(p1.token);
  const s2 = await connect(p2.token);
  const started = Promise.all([waitFor(s1, 'game:start'), waitFor(s2, 'game:start')]);
  expect((await call(s1, 'queue:join', { timeControl: '5+0' })).ok).toBe(true);
  expect((await call(s2, 'queue:join', { timeControl: '5+0' })).ok).toBe(true);
  const [g1, g2] = await started;
  expect(g1.gameId).toBe(g2.gameId);
  const white = g1.yourColor === 'w' ? { ...p1, socket: s1 } : { ...p2, socket: s2 };
  const black = g1.yourColor === 'w' ? { ...p2, socket: s2 } : { ...p1, socket: s1 };
  return { gameId: g1.gameId, state: g1, white, black };
}

async function play(player, gameId, from, to) {
  const res = await call(player.socket, 'game:move', { gameId, from, to });
  expect(res).toMatchObject({ ok: true });
  return res;
}

describe('game server', () => {
  test('rejects sockets without a valid token, and admins', async () => {
    await expect(connect('garbage')).rejects.toMatchObject({ data: { code: 'UNAUTHORIZED' } });
    const admin = await asUser({ role: 'ADMIN' });
    await expect(connect(admin.token)).rejects.toMatchObject({ data: { code: 'FORBIDDEN' } });
  });

  test('matchmaking, server-validated moves, checkmate, rating update and match record', async () => {
    const { gameId, state, white, black } = await pairedGame();
    expect(state).toMatchObject({ mode: 'RATED', status: 'ACTIVE', turn: 'w', clocks: { white: 300000, black: 300000 } });

    const wrongTurn = await call(black.socket, 'game:move', { gameId, from: 'e7', to: 'e5' });
    expect(wrongTurn).toMatchObject({ ok: false, code: 'NOT_YOUR_TURN' });
    const illegal = await call(white.socket, 'game:move', { gameId, from: 'e2', to: 'e5' });
    expect(illegal).toMatchObject({ ok: false, code: 'ILLEGAL_MOVE' });

    const outsider = await asUser();
    const os = await connect(outsider.token);
    expect(await call(os, 'game:move', { gameId, from: 'e2', to: 'e4' })).toMatchObject({ ok: false, code: 'NOT_IN_GAME' });

    const seenByBlack = waitFor(black.socket, 'game:move', (m) => m.ply === 1);
    await play(white, gameId, 'f2', 'f3');
    expect((await seenByBlack).move).toMatchObject({ san: 'f3', color: 'w' });
    await play(black, gameId, 'e7', 'e5');
    await play(white, gameId, 'g2', 'g4');
    const ended = waitFor(white.socket, 'game:end');
    await play(black, gameId, 'd8', 'h4');
    const end = await ended;
    expect(end).toMatchObject({ result: 'BLACK_WIN', termination: 'CHECKMATE', winner: 'b' });
    expect(end.ratings.black.after).toBeGreaterThan(1200);
    expect(end.ratings.white.after).toBeLessThan(1200);

    const match = await Match.findById(gameId);
    expect(match).toMatchObject({ status: 'COMPLETED', result: 'BLACK_WIN', termination: 'CHECKMATE', moveCount: 4 });
    expect(match.pgn).toContain('Qh4#');
    expect(String(match.winnerId)).toBe(String(black.user._id));
    expect((await User.findById(black.user._id)).rating).toBe(end.ratings.black.after);

    // History and stats endpoints read the same record
    const stats = await api().get('/api/v1/player/stats').set('Authorization', `Bearer ${black.token}`);
    expect(stats.body.data).toMatchObject({ played: 1, wins: 1, rating: end.ratings.black.after });
  });

  test('draw offer accepted ends the game as a draw', async () => {
    const { gameId, white, black } = await pairedGame();
    await play(white, gameId, 'e2', 'e4');
    await play(black, gameId, 'e7', 'e5');
    const offer = waitFor(black.socket, 'game:drawOffer');
    expect((await call(white.socket, 'game:offerDraw', { gameId })).ok).toBe(true);
    expect(await offer).toMatchObject({ by: 'w' });
    const ended = waitFor(white.socket, 'game:end');
    await call(black.socket, 'game:respondDraw', { gameId, accept: true });
    expect(await ended).toMatchObject({ result: 'DRAW', termination: 'AGREEMENT' });
  });

  test('resignation', async () => {
    const { gameId, white, black } = await pairedGame();
    await play(white, gameId, 'd2', 'd4');
    await play(black, gameId, 'd7', 'd5');
    const ended = waitFor(black.socket, 'game:end');
    await call(white.socket, 'game:resign', { gameId });
    expect(await ended).toMatchObject({ result: 'BLACK_WIN', termination: 'RESIGNATION' });
  });

  test('no first move aborts the game without rating change', async () => {
    const { gameId, white } = await pairedGame();
    const end = await waitFor(white.socket, 'game:end');
    expect(end).toMatchObject({ result: 'ABORTED', ratings: null });
    expect((await Match.findById(gameId)).status).toBe('ABORTED');
    expect((await User.findById(white.user._id)).rating).toBe(1200);
  });

  test('a player who leaves and does not return loses by abandonment', async () => {
    const { gameId, white, black } = await pairedGame();
    await play(white, gameId, 'e2', 'e4');
    await play(black, gameId, 'c7', 'c5');
    const notice = waitFor(white.socket, 'game:opponentDisconnected');
    const ended = waitFor(white.socket, 'game:end');
    black.socket.disconnect();
    expect(await notice).toMatchObject({ color: 'b' });
    expect(await ended).toMatchObject({ result: 'WHITE_WIN', termination: 'ABANDONED' });
  });

  test('reconnecting restores the game state', async () => {
    const { gameId, white, black } = await pairedGame();
    await play(white, gameId, 'e2', 'e4');
    black.socket.disconnect();
    // Back within the reconnect grace period
    const s =connectClient(url, { auth: { token: black.token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(s);
    const state = await waitFor(s, 'game:state');
    expect(state).toMatchObject({ gameId, yourColor: 'b', turn: 'b', moves: ['e4'] });
    const active = await api().get('/api/v1/player/active-game').set('Authorization', `Bearer ${black.token}`);
    expect(active.body.data.gameId).toBe(gameId);
  });

  test('play vs computer: computer answers moves, game is unrated', async () => {
    const p = await asUser();
    const s = await connect(p.token);
    const started = waitFor(s, 'game:start');
    const res = await call(s, 'game:computer', { level: 1, color: 'white' });
    expect(res.ok).toBe(true);
    const state = await started;
    expect(state).toMatchObject({ mode: 'VS_COMPUTER', yourColor: 'w', clocks: null });
    expect(state.black).toMatchObject({ isComputer: true });

    const reply = waitFor(s, 'game:move', (m) => m.move.color === 'b');
    await call(s, 'game:move', { gameId: res.data.gameId, from: 'e2', to: 'e4' });
    expect((await reply).ply).toBe(2);

    const busy = await call(s, 'queue:join', { timeControl: '5+0' });
    expect(busy).toMatchObject({ ok: false, code: 'ALREADY_IN_GAME' });
    await call(s, 'game:resign', { gameId: res.data.gameId });
    expect((await User.findById(p.user._id)).rating).toBe(1200);
  });
});
