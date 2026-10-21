const Match = require('../src/models/Match');
const AuditLog = require('../src/models/AuditLog');
const { api, startDb, stopDb, resetDb, createUser, asUser } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const auth = (token) => ({ Authorization: `Bearer ${token}` });

async function addMatch(white, black, result, extra = {}) {
  return Match.create({
    white: { userId: white._id, displayName: white.displayName, ratingBefore: 1200, ratingAfter: result === 'WHITE_WIN' ? 1216 : 1184 },
    black: { userId: black._id, displayName: black.displayName, ratingBefore: 1200, ratingAfter: result === 'BLACK_WIN' ? 1216 : 1184 },
    mode: 'RATED',
    timeControl: { initialSeconds: 300, incrementSeconds: 0, label: '5+0' },
    status: 'COMPLETED',
    result,
    termination: 'CHECKMATE',
    startedAt: new Date(),
    endedAt: new Date(),
    ...extra,
  });
}

describe('admin players', () => {
  test('list supports search, filter and pagination', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    await createUser({ displayName: 'Vikash Kumar' });
    await createUser({ displayName: 'Priya Sharma' });
    await createUser({ displayName: 'Vikas Jain', status: 'SUSPENDED' });

    const res = await api().get('/api/v1/admin/players?search=vika&limit=1&sortBy=displayName&sortOrder=asc').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data.pagination).toEqual({ page: 1, limit: 1, total: 2, totalPages: 2 });
    expect(res.body.data.items[0].displayName).toBe('Vikas Jain');

    const active = await api().get('/api/v1/admin/players?status=ACTIVE').set(auth(admin.token));
    expect(active.body.data.pagination.total).toBe(2);

    const badSort = await api().get('/api/v1/admin/players?sortBy=passwordHash').set(auth(admin.token));
    expect(badSort.status).toBe(422);
  });

  test('suspension blocks the player immediately and is audited', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const player = await asUser();

    const res = await api()
      .patch(`/api/v1/admin/players/${player.user._id}/status`)
      .set(auth(admin.token))
      .send({ status: 'SUSPENDED', reason: 'Cheating' });
    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('SUSPENDED');

    expect((await api().get('/api/v1/player/profile').set(auth(player.token))).status).toBe(403);
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken: player.refreshToken })).status).toBe(401);

    const log = await AuditLog.findOne({ action: 'PLAYER_SUSPENDED' });
    expect(log).toMatchObject({ actorEmail: admin.user.email, targetId: String(player.user._id), outcome: 'SUCCESS' });

    const logs = await api().get('/api/v1/admin/audit-logs?action=PLAYER_SUSPENDED').set(auth(admin.token));
    expect(logs.body.data.items).toHaveLength(1);
  });

  test('role policy: admins cannot change roles or manage admins; super admin can', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const superAdmin = await asUser({ role: 'SUPER_ADMIN' });
    const player = await createUser();
    const otherAdmin = await createUser({ role: 'ADMIN' });

    expect((await api().patch(`/api/v1/admin/players/${player._id}/role`).set(auth(admin.token)).send({ role: 'ADMIN' })).status).toBe(403);
    expect((await api().patch(`/api/v1/admin/players/${otherAdmin._id}/status`).set(auth(admin.token)).send({ status: 'SUSPENDED' })).status).toBe(403);
    expect((await api().patch(`/api/v1/admin/players/${admin.user._id}/status`).set(auth(admin.token)).send({ status: 'SUSPENDED' })).status).toBe(403);

    const promoted = await api().patch(`/api/v1/admin/players/${player._id}/role`).set(auth(superAdmin.token)).send({ role: 'ADMIN' });
    expect(promoted.status).toBe(200);
    expect(promoted.body.data.role).toBe('ADMIN');

    const self = await api().patch(`/api/v1/admin/players/${superAdmin.user._id}/role`).set(auth(superAdmin.token)).send({ role: 'PLAYER' });
    expect(self.status).toBe(403);
  });

  test('unknown ids return 404 JSON', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const res = await api().get('/api/v1/admin/players/not-an-id').set(auth(admin.token));
    expect(res.status).toBe(404);
    expect(res.body).toMatchObject({ success: false, code: 'NOT_FOUND' });
    const route = await api().get('/api/v1/nope');
    expect(route.status).toBe(404);
    expect(route.body.success).toBe(false);
  });
});

describe('settings', () => {
  test('only allowed keys; super admin only; persisted and audited', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const superAdmin = await asUser({ role: 'SUPER_ADMIN' });

    expect((await api().patch('/api/v1/admin/settings').set(auth(admin.token)).send({ registrationOpen: false })).status).toBe(403);
    expect((await api().patch('/api/v1/admin/settings').set(auth(superAdmin.token)).send({ hack: true })).status).toBe(422);

    const res = await api().patch('/api/v1/admin/settings').set(auth(superAdmin.token)).send({ registrationOpen: false });
    expect(res.status).toBe(200);
    const read = await api().get('/api/v1/admin/settings').set(auth(admin.token));
    expect(read.body.data.registrationOpen).toBe(false);

    const reg = await api().post('/api/v1/auth/register').send({ email: 'x@y.dev', password: 'Secret123', displayName: 'Xyz' });
    expect(reg.status).toBe(403);
    expect(await AuditLog.exists({ action: 'SETTINGS_UPDATED' })).toBeTruthy();
  });

  test('maintenance mode blocks player APIs with 503', async () => {
    const superAdmin = await asUser({ role: 'SUPER_ADMIN' });
    const player = await asUser();
    await api().patch('/api/v1/admin/settings').set(auth(superAdmin.token)).send({ maintenanceMode: true });
    const res = await api().get('/api/v1/player/wallet').set(auth(player.token));
    expect(res.status).toBe(503);
  });
});

describe('player profile, history and stats', () => {
  test('profile allows only permitted fields', async () => {
    const player = await asUser();
    const ok = await api().patch('/api/v1/player/profile').set(auth(player.token)).send({ displayName: 'Magnus Fan', country: 'in' });
    expect(ok.status).toBe(200);
    expect(ok.body.data).toMatchObject({ displayName: 'Magnus Fan', country: 'IN' });

    for (const body of [{ rating: 3000 }, { role: 'ADMIN' }, { email: 'x@y.dev' }]) {
      expect((await api().patch('/api/v1/player/profile').set(auth(player.token)).send(body)).status).toBe(422);
    }

    const s = await api().patch('/api/v1/player/settings').set(auth(player.token)).send({ boardTheme: 'wood', soundEnabled: false });
    expect(s.body.data).toMatchObject({ boardTheme: 'wood', soundEnabled: false });
    const again = await api().get('/api/v1/player/settings').set(auth(player.token));
    expect(again.body.data.boardTheme).toBe('wood');
  });

  test('stats and history derive from match records', async () => {
    const me = await asUser();
    const opp = await createUser({ displayName: 'Opponent' });
    await addMatch(me.user, opp, 'WHITE_WIN');
    await addMatch(opp, me.user, 'WHITE_WIN');
    await addMatch(me.user, opp, 'DRAW');
    await addMatch(opp, me.user, 'BLACK_WIN');
    await addMatch(me.user, opp, 'WHITE_WIN', { status: 'ONGOING', result: undefined });

    const stats = await api().get('/api/v1/player/stats').set(auth(me.token));
    expect(stats.body.data).toMatchObject({ played: 4, wins: 2, losses: 1, draws: 1, winRate: 50 });
    expect(stats.body.data.byColor.white).toMatchObject({ played: 2, wins: 1, draws: 1 });

    const history = await api().get('/api/v1/player/game-history?status=COMPLETED').set(auth(me.token));
    expect(history.body.data.pagination.total).toBe(4);
    expect(history.body.data.items[0]).toHaveProperty('outcome');
    expect(history.body.data.items[0].opponent.displayName).toBe('Opponent');
  });
});

describe('game activity and reports', () => {
  test('admin can filter matches, read reports and export CSV', async () => {
    const admin = await asUser({ role: 'ADMIN' });
    const a = await createUser({ displayName: 'Alpha' });
    const b = await createUser({ displayName: '=Bravo' });
    const m = await addMatch(a, b, 'BLACK_WIN');
    await addMatch(b, a, 'DRAW', { mode: 'CASUAL' });

    const list = await api().get(`/api/v1/admin/game-activity?mode=RATED&playerId=${a._id}`).set(auth(admin.token));
    expect(list.body.data.items).toHaveLength(1);
    const one = await api().get(`/api/v1/admin/game-activity/${m._id}`).set(auth(admin.token));
    expect(one.body.data.result).toBe('BLACK_WIN');

    const report = await api().get('/api/v1/admin/reports?type=matches').set(auth(admin.token));
    expect(report.body.data.byMode).toEqual({ RATED: 1, CASUAL: 1 });

    const csv = await api().get('/api/v1/admin/reports/export?type=matches').set(auth(admin.token));
    expect(csv.status).toBe(200);
    expect(csv.headers['content-type']).toMatch(/text\/csv/);
    const lines = csv.text.split('\n');
    expect(lines).toHaveLength(3);
    // Formula injection is neutralised
    expect(csv.text).toContain("'=Bravo");
    expect(await AuditLog.exists({ action: 'REPORT_EXPORTED' })).toBeTruthy();

    const activity = await api().get('/api/v1/admin/dashboard/activity').set(auth(admin.token));
    expect(activity.body.data.items.some((i) => i.type === 'MATCH_COMPLETED')).toBe(true);
  });
});
