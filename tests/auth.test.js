const crypto = require('crypto');
const PasswordReset = require('../src/models/PasswordReset');
const { sha256 } = require('../src/services/tokenService');
const { api, startDb, stopDb, resetDb, createUser, login, asUser } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

describe('auth', () => {
  test('register returns session and user without secrets', async () => {
    const res = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'New@Player.dev', password: 'Secret123', displayName: 'New Player' });
    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.user).toMatchObject({ email: 'new@player.dev', role: 'PLAYER', status: 'ACTIVE' });
    expect(res.body.data.accessToken).toBeDefined();
    expect(res.body.data.refreshToken).toBeDefined();
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);

    const dup = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'new@player.dev', password: 'Secret123', displayName: 'Another' });
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('EMAIL_TAKEN');
  });

  test('register rejects weak password and unknown fields with 422', async () => {
    const weak = await api().post('/api/v1/auth/register').send({ email: 'a@b.dev', password: 'short', displayName: 'Abc' });
    expect(weak.status).toBe(422);
    expect(weak.body.code).toBe('VALIDATION_ERROR');
    const role = await api()
      .post('/api/v1/auth/register')
      .send({ email: 'a@b.dev', password: 'Secret123', displayName: 'Abc', role: 'ADMIN' });
    expect(role.status).toBe(422);
  });

  test('login with wrong password is 401, suspended account is 403', async () => {
    const user = await createUser();
    const bad = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Wrong1234' });
    expect(bad.status).toBe(401);
    expect(bad.body).toEqual({ success: false, message: 'Invalid email or password', code: 'INVALID_CREDENTIALS' });

    const suspended = await createUser({ status: 'SUSPENDED' });
    const res = await api().post('/api/v1/auth/login').send({ email: suspended.email, password: 'Password123' });
    expect(res.status).toBe(403);
  });

  test('player cannot sign in to the admin portal', async () => {
    const user = await createUser();
    const res = await api().post('/api/v1/auth/login').send({ email: user.email, password: 'Password123', portal: 'admin' });
    expect(res.status).toBe(403);
  });

  test('me requires a valid bearer token', async () => {
    expect((await api().get('/api/v1/auth/me')).status).toBe(401);
    expect((await api().get('/api/v1/auth/me').set('Authorization', 'Bearer nope')).status).toBe(401);
    const { token, user } = await asUser();
    const res = await api().get('/api/v1/auth/me').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.user).toMatchObject({ id: String(user._id), email: user.email, role: 'PLAYER' });
  });

  test('refresh rotates tokens and reuse of an old token revokes the family', async () => {
    const { refreshToken } = await asUser();
    const first = await api().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(first.status).toBe(200);
    const rotated = first.body.data.refreshToken;
    expect(rotated).not.toBe(refreshToken);

    // Old token replayed -> rejected, and the newer token is revoked too
    const replay = await api().post('/api/v1/auth/refresh').send({ refreshToken });
    expect(replay.status).toBe(401);
    const afterReuse = await api().post('/api/v1/auth/refresh').send({ refreshToken: rotated });
    expect(afterReuse.status).toBe(401);
  });

  test('logout invalidates the refresh token server-side', async () => {
    const { refreshToken } = await asUser();
    expect((await api().post('/api/v1/auth/logout').send({ refreshToken })).status).toBe(200);
    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
  });

  test('web clients get the refresh token as httpOnly cookie only', async () => {
    const user = await createUser({ role: 'ADMIN' });
    const res = await api()
      .post('/api/v1/auth/login')
      .set('X-Client-Type', 'web')
      .send({ email: user.email, password: 'Password123', portal: 'admin' });
    expect(res.status).toBe(200);
    expect(res.body.data.refreshToken).toBeUndefined();
    const cookie = res.headers['set-cookie'][0];
    expect(cookie).toMatch(/^rt=/);
    expect(cookie).toMatch(/HttpOnly/);

    const refreshed = await api().post('/api/v1/auth/refresh').set('X-Client-Type', 'web').set('Cookie', cookie.split(';')[0]);
    expect(refreshed.status).toBe(200);
  });

  test('forgot-password does not reveal whether the email exists', async () => {
    const user = await createUser();
    const known = await api().post('/api/v1/auth/forgot-password').send({ email: user.email });
    const unknown = await api().post('/api/v1/auth/forgot-password').send({ email: 'nobody@test.dev' });
    expect(known.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
    expect(await PasswordReset.countDocuments({ userId: user._id })).toBe(1);
  });

  test('reset-password sets new password, is single-use and ends sessions', async () => {
    const { user, refreshToken } = await asUser();
    const token = crypto.randomBytes(32).toString('base64url');
    await PasswordReset.create({ userId: user._id, tokenHash: sha256(token), expiresAt: new Date(Date.now() + 60000) });

    const res = await api().post('/api/v1/auth/reset-password').send({ token, password: 'BrandNew123' });
    expect(res.status).toBe(200);
    const again = await api().post('/api/v1/auth/reset-password').send({ token, password: 'BrandNew456' });
    expect(again.status).toBe(400);

    expect((await api().post('/api/v1/auth/refresh').send({ refreshToken })).status).toBe(401);
    await expect(login(user, 'BrandNew123')).resolves.toHaveProperty('accessToken');
  });
});
