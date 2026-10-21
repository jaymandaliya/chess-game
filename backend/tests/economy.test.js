const http = require('http');
const { io: connectClient } = require('socket.io-client');
const Wallet = require('../src/models/Wallet');
const Transaction = require('../src/models/Transaction');
const PlatformFee = require('../src/models/PlatformFee');
const Tournament = require('../src/models/Tournament');
const AuditLog = require('../src/models/AuditLog');
const walletService = require('../src/services/walletService');
const tournamentService = require('../src/services/tournamentService');
const { getProvider } = require('../src/services/paymentProvider');
const { withTransaction } = require('../src/utils/transaction');
const { attachSocket } = require('../src/game/socket');
const manager = require('../src/game/gameManager');
const { app, api, startDb, stopDb, resetDb, asUser } = require('./helpers');

const FAST = { firstMoveMs: 5000, reconnectGraceMs: 400, computerDelayMs: 10 };
let server;
let io;
let url;
const sockets = [];
const auth = (token) => ({ Authorization: `Bearer ${token}` });

beforeAll(async () => {
  await startDb();
  server = http.createServer(app);
  io = attachSocket(server, { config: FAST });
  tournamentService.stop();
  await new Promise((resolve) => server.listen(0, resolve));
  url = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  manager.reset();
  tournamentService.stop();
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
const call = (socket, event, payload) => new Promise((resolve) => socket.emit(event, payload, resolve));
function waitFor(socket, event, predicate = () => true, timeoutMs = 6000) {
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

async function giveCoins(userId, amount, coinType = 'PLAY') {
  await withTransaction((session) =>
    walletService.credit({ userId, amount, coinType, type: 'ADJUSTMENT', description: 'test' }, session),
  );
}

async function balances(userId) {
  return walletService.getBalances(userId);
}

describe('coin packages with tournament bonus', () => {
  test('a paid order credits play coins and tournament bonus coins', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const player = await asUser();
    const pkg = (
      await api().post('/api/v1/admin/coin-packages').set(auth(admin.token)).send({ name: 'Starter', coins: 100, bonusTournamentCoins: 30, pricePaise: 9900 })
    ).body.data;
    expect(pkg.bonusTournamentCoins).toBe(30);

    const { order } = (await api().post('/api/v1/player/coin-orders').set(auth(player.token)).send({ packageId: pkg.id })).body.data;
    expect(order).toMatchObject({ coins: 100, tournamentCoins: 30, amountPaise: 9900 });

    const provider = getProvider();
    const verify = await api()
      .post('/api/v1/payments/verify')
      .set(auth(player.token))
      .send({ providerOrderId: order.providerOrderId, providerPaymentId: 'pay_b', signature: provider.signCheckout(order.providerOrderId, 'pay_b') });
    expect(verify.status).toBe(200);

    const wallet = (await api().get('/api/v1/player/wallet').set(auth(player.token))).body.data;
    expect(wallet).toMatchObject({ balance: 100, tournamentBalance: 30 });
    const bonusTx = await api().get('/api/v1/player/transactions?coinType=TOURNAMENT').set(auth(player.token));
    expect(bonusTx.body.data.items).toEqual([expect.objectContaining({ type: 'BONUS', amount: 30, coinType: 'TOURNAMENT' })]);
  });
});

describe('coin stakes in online games', () => {
  async function stakedGame(stake) {
    const p1 = await asUser();
    const p2 = await asUser();
    await giveCoins(p1.user._id, 100);
    await giveCoins(p2.user._id, 100);
    const s1 = await connect(p1.token);
    const s2 = await connect(p2.token);
    const started = Promise.all([waitFor(s1, 'game:start'), waitFor(s2, 'game:start')]);
    expect(await call(s1, 'queue:join', { timeControl: '5+0', stake })).toMatchObject({ ok: true });
    expect(await call(s2, 'queue:join', { timeControl: '5+0', stake })).toMatchObject({ ok: true });
    const [g1] = await started;
    const white = g1.yourColor === 'w' ? { ...p1, socket: s1 } : { ...p2, socket: s2 };
    const black = g1.yourColor === 'w' ? { ...p2, socket: s2 } : { ...p1, socket: s1 };
    return { gameId: g1.gameId, state: g1, white, black };
  }

  test('stakes are held, winner gets the pot minus 15%, fee is logged', async () => {
    const { gameId, state, white, black } = await stakedGame(50);
    expect(state).toMatchObject({ stake: 50, feePercent: 15 });
    expect((await balances(white.user._id)).play).toBe(50);

    for (const [p, from, to] of [[white, 'f2', 'f3'], [black, 'e7', 'e5'], [white, 'g2', 'g4']]) {
      expect(await call(p.socket, 'game:move', { gameId, from, to })).toMatchObject({ ok: true });
    }
    const ended = waitFor(white.socket, 'game:end');
    await call(black.socket, 'game:move', { gameId, from: 'd8', to: 'h4' });
    await ended;
    await new Promise((r) => setTimeout(r, 150));

    expect((await balances(black.user._id)).play).toBe(50 + 85); // 100 pot − 15 fee
    expect((await balances(white.user._id)).play).toBe(50);
    const fee = await PlatformFee.findOne({ refId: gameId });
    expect(fee).toMatchObject({ source: 'GAME', coins: 15, grossCoins: 100, feePercent: 15 });
  });

  test('a draw returns both stakes without a fee', async () => {
    const { gameId, white, black } = await stakedGame(10);
    await call(white.socket, 'game:move', { gameId, from: 'e2', to: 'e4' });
    await call(black.socket, 'game:move', { gameId, from: 'e7', to: 'e5' });
    await call(white.socket, 'game:offerDraw', { gameId });
    const ended = waitFor(white.socket, 'game:end');
    await call(black.socket, 'game:respondDraw', { gameId, accept: true });
    await ended;
    await new Promise((r) => setTimeout(r, 150));
    expect((await balances(white.user._id)).play).toBe(100);
    expect((await balances(black.user._id)).play).toBe(100);
    expect(await PlatformFee.countDocuments()).toBe(0);
  });

  test('cannot join a staked queue without enough coins, or with an unlisted stake', async () => {
    const p = await asUser();
    const s = await connect(p.token);
    expect(await call(s, 'queue:join', { timeControl: '5+0', stake: 50 })).toMatchObject({ ok: false, code: 'INSUFFICIENT_BALANCE' });
    expect(await call(s, 'queue:join', { timeControl: '5+0', stake: 7 })).toMatchObject({ ok: false, code: 'INVALID_STAKE' });
    expect(await call(s, 'queue:join', { timeControl: '5+0', stake: 0 })).toMatchObject({ ok: true });
  });
});

describe('knockout tournaments', () => {
  async function createTournament(admin, overrides = {}) {
    const res = await api()
      .post('/api/v1/admin/tournaments')
      .set(auth(admin.token))
      .send({ name: 'Friday Cup', entryFee: 100, timeControl: '5+0', maxPlayers: 4, prizeSplit: [70, 30], startsAt: new Date(Date.now() + 3600e3).toISOString(), ...overrides });
    expect(res.status).toBe(201);
    return res.body.data;
  }

  async function entrant() {
    const p = await asUser();
    await giveCoins(p.user._id, 150, 'TOURNAMENT');
    return p;
  }

  // Both players of a pairing tap Ready; the higher seed (White) wins by the opponent's resignation
  async function playPairing(tId, a, b) {
    const sa = await connect(a.token);
    const sb = await connect(b.token);
    const startA = waitFor(sa, 'game:start');
    await api().post(`/api/v1/player/tournaments/${tId}/ready`).set(auth(a.token));
    await api().post(`/api/v1/player/tournaments/${tId}/ready`).set(auth(b.token));
    const game = await startA;
    const [w, bl] = game.yourColor === 'w' ? [sa, sb] : [sb, sa];
    await call(w, 'game:move', { gameId: game.gameId, from: 'e2', to: 'e4' });
    await call(bl, 'game:move', { gameId: game.gameId, from: 'e7', to: 'e5' });
    const ended = waitFor(w, 'game:end');
    await call(bl, 'game:resign', { gameId: game.gameId });
    await ended;
    await new Promise((r) => setTimeout(r, 250));
    sa.disconnect();
    sb.disconnect();
    return game.yourColor === 'w' ? a : b;
  }

  test('full 4-player knockout: entries, bracket, games, prizes and fee', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const t = await createTournament(admin);
    const players = [await entrant(), await entrant(), await entrant(), await entrant()];

    const poor = await asUser();
    expect((await api().post(`/api/v1/player/tournaments/${t.id}/join`).set(auth(poor.token))).body.code).toBe('INSUFFICIENT_BALANCE');

    for (const p of players) {
      const r = await api().post(`/api/v1/player/tournaments/${t.id}/join`).set(auth(p.token));
      expect(r.status).toBe(200);
    }
    expect((await balances(players[0].user._id)).tournament).toBe(50);

    let doc = await Tournament.findById(t.id);
    expect(doc.status).toBe('RUNNING');
    expect(doc.prizePool).toBe(400);
    expect(doc.rounds[0].pairings).toHaveLength(2);

    const byUser = (uid) => players.find((p) => String(p.user._id) === String(uid));
    const finalists = [];
    for (const pairing of doc.rounds[0].pairings) {
      finalists.push(await playPairing(t.id, byUser(pairing.a.userId), byUser(pairing.b.userId)));
    }
    doc = await Tournament.findById(t.id);
    expect(doc.rounds).toHaveLength(2);
    const champion = await playPairing(t.id, finalists[0], finalists[1]);
    const runnerUp = finalists.find((f) => f !== champion);

    doc = await Tournament.findById(t.id);
    expect(doc.status).toBe('COMPLETED');
    // pool 400, 15% fee = 60, net 340 → 70% = 238, 30% = 102
    expect(doc.payouts.map((p) => p.coins)).toEqual([238, 102]);
    expect(String(doc.winnerId)).toBe(String(champion.user._id));
    expect((await balances(champion.user._id)).play).toBe(238);
    expect((await balances(runnerUp.user._id)).play).toBe(102);
    expect(await PlatformFee.findOne({ refId: t.id })).toMatchObject({ source: 'TOURNAMENT', coins: 60 });

    const view = (await api().get(`/api/v1/player/tournaments/${t.id}`).set(auth(champion.token))).body.data;
    expect(view).toMatchObject({ status: 'COMPLETED', joined: true });
  });

  test('a player who never shows up forfeits when the round time runs out', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const t = await createTournament(admin, { maxPlayers: 4 });
    const a = await entrant();
    const b = await entrant();
    for (const p of [a, b]) await api().post(`/api/v1/player/tournaments/${t.id}/join`).set(auth(p.token));
    expect((await api().post(`/api/v1/admin/tournaments/${t.id}/start`).set(auth(admin.token))).status).toBe(200);

    await api().post(`/api/v1/player/tournaments/${t.id}/ready`).set(auth(a.token));
    await Tournament.updateOne({ _id: t.id }, { $set: { 'rounds.0.deadlineAt': new Date(Date.now() - 1000) } });
    await tournamentService.tick();

    const doc = await Tournament.findById(t.id);
    expect(doc.status).toBe('COMPLETED');
    expect(String(doc.winnerId)).toBe(String(a.user._id));
    expect(doc.rounds[0].pairings[0].decidedBy).toBe('FORFEIT');
  });

  test('leaving before start and cancellation refund tournament coins', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const t = await createTournament(admin);
    const a = await entrant();
    const b = await entrant();
    for (const p of [a, b]) await api().post(`/api/v1/player/tournaments/${t.id}/join`).set(auth(p.token));
    await api().post(`/api/v1/player/tournaments/${t.id}/leave`).set(auth(a.token));
    expect((await balances(a.user._id)).tournament).toBe(150);

    const res = await api().post(`/api/v1/admin/tournaments/${t.id}/cancel`).set(auth(admin.token)).send({ reason: 'Venue issue' });
    expect(res.body.data.status).toBe('CANCELLED');
    expect((await balances(b.user._id)).tournament).toBe(150);
    expect(await AuditLog.exists({ action: 'TOURNAMENT_CANCELLED' })).toBeTruthy();
  });
});

describe('KYC and withdrawals (money out)', () => {
  const kycBody = { fullName: 'Vikash Kumar', dateOfBirth: '1995-04-12', pan: 'abcde1234f', payoutMethod: 'UPI', upiId: 'vikash@okaxis' };

  test('disabled by default, then KYC-gated, quoted server-side, reviewed by admin', async () => {
    const superAdmin = await asUser({ role: 'SUPER_ADMIN' });
    const player = await asUser();
    await giveCoins(player.user._id, 1000);

    const off = await api().post('/api/v1/player/withdrawals').set(auth(player.token)).send({ coins: 600 });
    expect(off.body.code).toBe('WITHDRAWALS_DISABLED');
    await api().patch('/api/v1/admin/settings').set(auth(superAdmin.token)).send({ withdrawalsEnabled: true });

    expect((await api().post('/api/v1/player/withdrawals').set(auth(player.token)).send({ coins: 600 })).body.code).toBe('KYC_REQUIRED');

    const badPan = await api().post('/api/v1/player/kyc').set(auth(player.token)).send({ ...kycBody, pan: '1234' });
    expect(badPan.status).toBe(422);
    const minor = await api().post('/api/v1/player/kyc').set(auth(player.token)).send({ ...kycBody, dateOfBirth: '2015-01-01' });
    expect(minor.status).toBe(422);

    const submitted = await api().post('/api/v1/player/kyc').set(auth(player.token)).send(kycBody);
    expect(submitted.status).toBe(201);
    expect(submitted.body.data).toMatchObject({ status: 'PENDING', pan: 'AB•••••34F' });
    expect(JSON.stringify(submitted.body)).not.toContain('ABCDE1234F');

    const full = await api().get(`/api/v1/admin/kyc/${player.user._id}`).set(auth(superAdmin.token));
    expect(full.body.data).toMatchObject({ pan: 'ABCDE1234F', upiId: 'vikash@okaxis' });
    expect(await AuditLog.exists({ action: 'KYC_VIEWED' })).toBeTruthy();
    await api().patch(`/api/v1/admin/kyc/${player.user._id}`).set(auth(superAdmin.token)).send({ status: 'APPROVED' });

    expect((await api().post('/api/v1/player/withdrawals').set(auth(player.token)).send({ coins: 100 })).body.code).toBe('BELOW_MINIMUM');

    // 600 coins × ₹0.80 = ₹480, TDS 30% = ₹144, net ₹336
    const w1 = (await api().post('/api/v1/player/withdrawals').set(auth(player.token)).send({ coins: 600 })).body.data;
    expect(w1).toMatchObject({ status: 'PENDING', grossPaise: 48000, tdsPaise: 14400, netPaise: 33600, payoutTo: 'vi•••@okaxis' });
    expect((await balances(player.user._id)).play).toBe(400);

    const noRef = await api().patch(`/api/v1/admin/withdrawals/${w1.id}`).set(auth(superAdmin.token)).send({ action: 'PAY' });
    expect(noRef.status).toBe(422);
    await api().patch(`/api/v1/admin/withdrawals/${w1.id}`).set(auth(superAdmin.token)).send({ action: 'REJECT', reason: 'Name mismatch' });
    expect((await balances(player.user._id)).play).toBe(1000);

    const w2 = (await api().post('/api/v1/player/withdrawals').set(auth(player.token)).send({ coins: 500 })).body.data;
    const paid = await api().patch(`/api/v1/admin/withdrawals/${w2.id}`).set(auth(superAdmin.token)).send({ action: 'PAY', payoutReference: 'UTR123456' });
    expect(paid.body.data.status).toBe('PAID');
    const again = await api().patch(`/api/v1/admin/withdrawals/${w2.id}`).set(auth(superAdmin.token)).send({ action: 'REJECT', reason: 'oops' });
    expect(again.body.code).toBe('WITHDRAWAL_PROCESSED');

    const logs = (await api().get('/api/v1/admin/revenue-logs').set(auth(superAdmin.token))).body.data;
    expect(logs.summary).toMatchObject({ withdrawalsPaise: 40000, withdrawalsCount: 1 });
    expect(logs.items.some((i) => i.source === 'WITHDRAWAL_PAID')).toBe(true);

    const activity = (await api().get(`/api/v1/admin/players/${player.user._id}/activity`).set(auth(superAdmin.token))).body.data;
    expect(activity.balances).toEqual({ play: 500, tournament: 0 });
    expect(activity.kyc.status).toBe('APPROVED');
    expect(activity.timeline.some((e) => e.kind === 'WITHDRAWAL')).toBe(true);
    expect(await Transaction.countDocuments({ userId: player.user._id, type: 'WITHDRAWAL_REVERSAL' })).toBe(1);
    expect((await Wallet.findOne({ userId: player.user._id })).balance).toBe(500);
  });
});
