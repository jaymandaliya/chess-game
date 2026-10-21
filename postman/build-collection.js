// Generates the Postman collection + environments from one list of requests.
// Run: node postman/build-collection.js
const fs = require('fs');
const path = require('path');

const json = (obj) => ({ mode: 'raw', raw: JSON.stringify(obj, null, 2), options: { raw: { language: 'json' } } });

// Test scripts that store values for later requests
const saveSession = (prefix) => [
  'const res = pm.response.json();',
  'pm.test("status 2xx", () => pm.expect(pm.response.code).to.be.within(200, 299));',
  'if (res.success) {',
  `  pm.collectionVariables.set("${prefix}AccessToken", res.data.accessToken);`,
  `  if (res.data.refreshToken) pm.collectionVariables.set("${prefix}RefreshToken", res.data.refreshToken);`,
  `  pm.collectionVariables.set("${prefix}UserId", res.data.user.id);`,
  '}',
];
const saveId = (variable, expr = 'res.data.id') => [
  'const res = pm.response.json();',
  'pm.test("success", () => pm.expect(res.success).to.eql(true));',
  `if (res.success) pm.collectionVariables.set("${variable}", ${expr});`,
];

function req(name, method, url, { body, auth = 'player', tests, description, query } = {}) {
  const headers = [{ key: 'Content-Type', value: 'application/json' }];
  if (auth === 'web') headers.push({ key: 'X-Client-Type', value: 'web' });
  const raw = `{{baseUrl}}/api/v1${url}${query ? `?${query}` : ''}`;
  const item = {
    name,
    request: {
      method,
      header: headers,
      url: {
        raw,
        host: ['{{baseUrl}}'],
        path: ['api', 'v1', ...url.split('/').filter(Boolean)],
        ...(query ? { query: query.split('&').map((q) => ({ key: q.split('=')[0], value: q.split('=').slice(1).join('=') })) } : {}),
      },
      description,
    },
  };
  if (auth === 'player') item.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{playerAccessToken}}', type: 'string' }] };
  if (auth === 'admin') item.request.auth = { type: 'bearer', bearer: [{ key: 'token', value: '{{adminAccessToken}}', type: 'string' }] };
  if (auth === 'none' || auth === 'web') item.request.auth = { type: 'noauth' };
  if (body) item.request.body = json(body);
  if (tests) item.event = [{ listen: 'test', script: { type: 'text/javascript', exec: tests } }];
  return item;
}

const folder = (name, description, item) => ({ name, description, item });

const collection = {
  info: {
    name: 'Chess Platform API',
    description: [
      'REST API for the Chess Platform (player app + admin portal). Base path `/api/v1`.',
      '',
      '**Start here:** run `Auth → Login (player)` and `Auth → Login (admin)`. Tokens are saved to collection variables',
      'automatically; requests that create things (package, order, tournament, withdrawal) save their ids too.',
      '',
      'Responses: `{ success: true, data }` or `{ success: false, message, code, details? }`. Money is in paise.',
      'Access tokens last 15 minutes — run the Login or Refresh request again when you get `TOKEN_EXPIRED`.',
      '',
      'Live games use Socket.IO on the same host (see README "Game server"), which Postman REST requests do not cover.',
    ].join('\n'),
    schema: 'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
  },
  variable: [
    { key: 'baseUrl', value: 'http://localhost:4000' },
    { key: 'playerEmail', value: 'player1@example.com' },
    { key: 'playerPassword', value: 'Player123' },
    { key: 'adminEmail', value: 'admin@example.com' },
    { key: 'adminPassword', value: 'ChangeMe123' },
    ...['playerAccessToken', 'playerRefreshToken', 'playerUserId', 'adminAccessToken', 'adminRefreshToken', 'adminUserId',
      'packageId', 'orderId', 'providerOrderId', 'tournamentId', 'withdrawalId', 'matchId', 'auditLogId'].map((key) => ({ key, value: '' })),
  ],
  item: [
    folder('Auth', 'Sign up, sign in, sessions and passwords.', [
      req('Register', 'POST', '/auth/register', {
        auth: 'none',
        body: { email: 'new.player@example.com', password: 'Secret123', displayName: 'New Player' },
        tests: saveSession('player'),
      }),
      req('Login (player)', 'POST', '/auth/login', {
        auth: 'none',
        body: { email: '{{playerEmail}}', password: '{{playerPassword}}', portal: 'player' },
        tests: saveSession('player'),
      }),
      req('Login (admin)', 'POST', '/auth/login', {
        auth: 'none',
        body: { email: '{{adminEmail}}', password: '{{adminPassword}}', portal: 'admin' },
        tests: saveSession('admin'),
        description: 'Mobile-style login: refresh token returned in the body. The web portal sends `X-Client-Type: web` and gets an httpOnly cookie instead.',
      }),
      req('Me', 'GET', '/auth/me'),
      req('Refresh (rotates the refresh token)', 'POST', '/auth/refresh', {
        auth: 'none',
        body: { refreshToken: '{{playerRefreshToken}}' },
        tests: saveSession('player'),
        description: 'Each refresh token works once. Replaying an old one revokes the whole session family.',
      }),
      req('Change password', 'POST', '/auth/change-password', {
        body: { currentPassword: '{{playerPassword}}', newPassword: 'NewSecret123' },
        description: 'Signs out other devices and returns a fresh session. Update `playerPassword` afterwards.',
      }),
      req('Forgot password', 'POST', '/auth/forgot-password', { auth: 'none', body: { email: '{{playerEmail}}' } }),
      req('Reset password', 'POST', '/auth/reset-password', { auth: 'none', body: { token: '<token from reset email>', password: 'NewSecret123' } }),
      req('Logout', 'POST', '/auth/logout', { auth: 'none', body: { refreshToken: '{{playerRefreshToken}}' } }),
    ]),

    folder('Player – profile & stats', 'Signed-in player only (role PLAYER).', [
      req('Get profile', 'GET', '/player/profile'),
      req('Update profile', 'PATCH', '/player/profile', { body: { displayName: 'Vikash K', country: 'IN', bio: 'Blitz addict' } }),
      req('Get settings', 'GET', '/player/settings'),
      req('Update settings', 'PATCH', '/player/settings', { body: { boardTheme: 'green', showLegalMoves: true, autoQueen: false } }),
      req('Stats', 'GET', '/player/stats'),
      req('Game history', 'GET', '/player/game-history', { query: 'page=1&limit=20&status=COMPLETED' }),
      req('Active game', 'GET', '/player/active-game'),
    ]),

    folder('Player – wallet & coins', 'Two balances: play coins and tournament coins.', [
      req('Economy (stake options, fee, balances)', 'GET', '/player/economy'),
      req('Wallet', 'GET', '/player/wallet'),
      req('Transactions', 'GET', '/player/transactions', { query: 'page=1&limit=20&coinType=PLAY' }),
      req('Coin packages', 'GET', '/player/coin-packages', { tests: saveId('packageId', 'res.data.items[0] && res.data.items[0].id') }),
      req('Create coin order', 'POST', '/player/coin-orders', {
        body: { packageId: '{{packageId}}' },
        tests: [...saveId('orderId', 'res.data.order.id'), 'if (res.success) pm.collectionVariables.set("providerOrderId", res.data.checkout.providerOrderId);'],
        description: 'Only the package id is sent; price and coins come from the server. Use `checkout` to open Razorpay.',
      }),
      req('List my orders', 'GET', '/player/coin-orders'),
      req('Get order', 'GET', '/player/coin-orders/{{orderId}}'),
    ]),

    folder('Payments', 'Razorpay verification. Webhooks are called by Razorpay, not by apps.', [
      req('Verify payment', 'POST', '/payments/verify', {
        body: { providerOrderId: '{{providerOrderId}}', providerPaymentId: 'pay_XXXXXXXX', signature: '<razorpay_signature>' },
        description: 'Send the three values returned by Razorpay checkout. The server checks the signature and the payment with Razorpay.',
      }),
      req('Complete payment (mock provider, dev only)', 'POST', '/payments/mock/complete', {
        body: { providerOrderId: '{{providerOrderId}}' },
        description: 'Only exists when the backend runs with PAYMENT_PROVIDER=mock.',
      }),
      req('Webhook (Razorpay → server)', 'POST', '/payments/webhook', {
        auth: 'none',
        body: { event: 'payment.captured', payload: { payment: { entity: { id: 'pay_X', order_id: '{{providerOrderId}}', amount: 9900, currency: 'INR' } } } },
        description: 'Requires header `X-Razorpay-Signature` = HMAC-SHA256(raw body, RAZORPAY_WEBHOOK_SECRET); without it the server answers 400.',
      }),
    ]),

    folder('Player – tournaments', 'Knockout tournaments paid with tournament coins.', [
      req('List tournaments', 'GET', '/player/tournaments', { query: 'scope=open', tests: saveId('tournamentId', 'res.data.items[0] && res.data.items[0].id') }),
      req('Get tournament', 'GET', '/player/tournaments/{{tournamentId}}'),
      req('Join', 'POST', '/player/tournaments/{{tournamentId}}/join'),
      req('Leave (before start, refunds entry)', 'POST', '/player/tournaments/{{tournamentId}}/leave'),
      req('Ready for my match', 'POST', '/player/tournaments/{{tournamentId}}/ready', {
        description: 'When both players are ready the server starts the game and sends `game:start` over Socket.IO.',
      }),
    ]),

    folder('Player – KYC & withdrawals', 'Withdrawals are disabled until an admin enables them in settings.', [
      req('Get KYC', 'GET', '/player/kyc'),
      req('Submit KYC (UPI)', 'POST', '/player/kyc', {
        body: { fullName: 'Vikash Kumar', dateOfBirth: '1995-04-12', pan: 'ABCDE1234F', payoutMethod: 'UPI', upiId: 'vikash@okaxis' },
      }),
      req('Submit KYC (bank)', 'POST', '/player/kyc', {
        body: { fullName: 'Vikash Kumar', dateOfBirth: '1995-04-12', pan: 'ABCDE1234F', payoutMethod: 'BANK', bankAccount: '123456789012', ifsc: 'SBIN0001234', accountHolderName: 'Vikash Kumar' },
      }),
      req('Withdrawal config', 'GET', '/player/withdrawals/config'),
      req('Withdrawal quote', 'GET', '/player/withdrawals/quote', { query: 'coins=600' }),
      req('Request withdrawal', 'POST', '/player/withdrawals', { body: { coins: 600 }, tests: saveId('withdrawalId') }),
      req('My withdrawals', 'GET', '/player/withdrawals'),
    ]),

    folder('Admin – dashboard & reports', 'ADMIN or SUPER_ADMIN.', [
      req('Dashboard', 'GET', '/admin/dashboard', { auth: 'admin' }),
      req('Revenue by day', 'GET', '/admin/dashboard/revenue', { auth: 'admin', query: 'groupBy=day' }),
      req('Activity feed', 'GET', '/admin/dashboard/activity', { auth: 'admin', query: 'limit=20' }),
      req('Reports overview', 'GET', '/admin/reports', { auth: 'admin', query: 'type=overview&groupBy=day' }),
      req('Export CSV', 'GET', '/admin/reports/export', { auth: 'admin', query: 'type=payments' }),
      req('Revenue logs', 'GET', '/admin/revenue-logs', { auth: 'admin', query: 'source=ALL&page=1&limit=25' }),
    ]),

    folder('Admin – players', '', [
      req('List players', 'GET', '/admin/players', { auth: 'admin', query: 'page=1&limit=20&search=&status=ACTIVE&sortBy=createdAt&sortOrder=desc' }),
      req('Get player', 'GET', '/admin/players/{{playerUserId}}', { auth: 'admin' }),
      req('Player activity timeline', 'GET', '/admin/players/{{playerUserId}}/activity', { auth: 'admin' }),
      req('Player coin ledger', 'GET', '/admin/players/{{playerUserId}}/transactions', { auth: 'admin', query: 'coinType=PLAY&page=1&limit=25' }),
      req('Suspend / activate', 'PATCH', '/admin/players/{{playerUserId}}/status', { auth: 'admin', body: { status: 'SUSPENDED', reason: 'Fair play review' } }),
      req('Change role (super admin)', 'PATCH', '/admin/players/{{playerUserId}}/role', { auth: 'admin', body: { role: 'PLAYER' } }),
    ]),

    folder('Admin – coin packages & payments', '', [
      req('List packages', 'GET', '/admin/coin-packages', { auth: 'admin', query: 'sortBy=sortOrder&sortOrder=asc' }),
      req('Create package', 'POST', '/admin/coin-packages', {
        auth: 'admin',
        body: { name: 'Weekend Pack', coins: 250, bonusTournamentCoins: 50, pricePaise: 19900, tag: 'LIMITED', sortOrder: 5 },
        tests: saveId('packageId'),
      }),
      req('Update package', 'PATCH', '/admin/coin-packages/{{packageId}}', { auth: 'admin', body: { pricePaise: 17900 } }),
      req('Enable / disable package', 'PATCH', '/admin/coin-packages/{{packageId}}/status', { auth: 'admin', body: { active: false } }),
      req('List payments', 'GET', '/admin/payments', { auth: 'admin', query: 'status=PAID&page=1&limit=20' }),
      req('Get payment', 'GET', '/admin/payments/{{orderId}}', { auth: 'admin' }),
    ]),

    folder('Admin – tournaments', '', [
      req('List tournaments', 'GET', '/admin/tournaments', { auth: 'admin' }),
      req('Create tournament', 'POST', '/admin/tournaments', {
        auth: 'admin',
        body: { name: 'Sunday Blitz Cup', description: 'Weekly knockout', entryFee: 30, timeControl: '3+2', maxPlayers: 8, prizeSplit: [70, 30], roundMinutes: 10, startsAt: '2030-01-01T14:30:00.000Z' },
        tests: saveId('tournamentId'),
      }),
      req('Get tournament (with bracket)', 'GET', '/admin/tournaments/{{tournamentId}}', { auth: 'admin' }),
      req('Start now', 'POST', '/admin/tournaments/{{tournamentId}}/start', { auth: 'admin' }),
      req('Cancel & refund', 'POST', '/admin/tournaments/{{tournamentId}}/cancel', { auth: 'admin', body: { reason: 'Rescheduled' } }),
    ]),

    folder('Admin – KYC & withdrawals', '', [
      req('List KYC', 'GET', '/admin/kyc', { auth: 'admin', query: 'status=PENDING' }),
      req('Get KYC (full details, audited)', 'GET', '/admin/kyc/{{playerUserId}}', { auth: 'admin' }),
      req('Approve / reject KYC', 'PATCH', '/admin/kyc/{{playerUserId}}', { auth: 'admin', body: { status: 'APPROVED' } }),
      req('List withdrawals', 'GET', '/admin/withdrawals', { auth: 'admin', query: 'status=PENDING' }),
      req('Get withdrawal', 'GET', '/admin/withdrawals/{{withdrawalId}}', { auth: 'admin' }),
      req('Mark withdrawal paid', 'PATCH', '/admin/withdrawals/{{withdrawalId}}', { auth: 'admin', body: { action: 'PAY', payoutReference: 'UTR1234567890' } }),
      req('Reject withdrawal (refunds coins)', 'PATCH', '/admin/withdrawals/{{withdrawalId}}', { auth: 'admin', body: { action: 'REJECT', reason: 'Name does not match bank account' } }),
    ]),

    folder('Admin – games, audit & settings', '', [
      req('Game activity', 'GET', '/admin/game-activity', { auth: 'admin', query: 'status=COMPLETED&page=1&limit=20', tests: saveId('matchId', 'res.data.items[0] && res.data.items[0].id') }),
      req('Get match', 'GET', '/admin/game-activity/{{matchId}}', { auth: 'admin' }),
      req('Audit logs', 'GET', '/admin/audit-logs', { auth: 'admin', tests: saveId('auditLogId', 'res.data.items[0] && res.data.items[0].id') }),
      req('Get audit log', 'GET', '/admin/audit-logs/{{auditLogId}}', { auth: 'admin' }),
      req('Get settings', 'GET', '/admin/settings', { auth: 'admin' }),
      req('Update settings (super admin)', 'PATCH', '/admin/settings', {
        auth: 'admin',
        body: { winningsFeePercent: 15, stakeOptions: [0, 10, 50, 100], withdrawalsEnabled: false },
      }),
    ]),
  ],
};

const env = (name, baseUrl) => ({
  name,
  values: [{ key: 'baseUrl', value: baseUrl, enabled: true }],
  _postman_variable_scope: 'environment',
});

const out = __dirname;
fs.writeFileSync(path.join(out, 'ChessPlatform.postman_collection.json'), `${JSON.stringify(collection, null, 2)}\n`);
fs.writeFileSync(path.join(out, 'Local.postman_environment.json'), `${JSON.stringify(env('Chess Platform – Local', 'http://localhost:4000'), null, 2)}\n`);
fs.writeFileSync(
  path.join(out, 'Ngrok.postman_environment.json'),
  `${JSON.stringify(env('Chess Platform – Ngrok (Mac)', 'https://kenisha-immortalisable-nonreducibly.ngrok-free.dev'), null, 2)}\n`,
);
const count = collection.item.reduce((n, f) => n + f.item.length, 0);
console.log(`Wrote collection with ${collection.item.length} folders and ${count} requests`);
