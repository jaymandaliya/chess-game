const CoinPackage = require('../src/models/CoinPackage');
const Order = require('../src/models/Order');
const Transaction = require('../src/models/Transaction');
const AuditLog = require('../src/models/AuditLog');
const { getProvider } = require('../src/services/paymentProvider');
const { api, startDb, stopDb, resetDb, asUser } = require('./helpers');

beforeAll(startDb);
afterAll(stopDb);
beforeEach(resetDb);

const provider = getProvider();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

function webhook(event, payment, extra = {}) {
  const raw = JSON.stringify({ event, payload: { payment: { entity: payment }, ...extra } });
  return api()
    .post('/api/v1/payments/webhook')
    .set('Content-Type', 'application/json')
    .set('X-Razorpay-Signature', provider.signWebhook(raw))
    .set('X-Razorpay-Event-Id', `evt_${Math.random().toString(36).slice(2)}`)
    .send(raw);
}

async function setup() {
  const admin = await asUser({ role: 'ADMIN' });
  const player = await asUser();
  const created = await api()
    .post('/api/v1/admin/coin-packages')
    .set(auth(admin.token))
    .send({ name: 'Champion', coins: 2500, pricePaise: 39900, tag: 'MOST POPULAR' });
  expect(created.status).toBe(201);
  return { admin, player, pkg: created.body.data };
}

async function buyAndCreateOrder(player, pkg) {
  const res = await api().post('/api/v1/player/coin-orders').set(auth(player.token)).send({ packageId: pkg.id });
  expect(res.status).toBe(201);
  return res.body.data;
}

async function balance(player) {
  const res = await api().get('/api/v1/player/wallet').set(auth(player.token));
  return res.body.data.balance;
}

describe('coin packages', () => {
  test('admin CRUD with validation, duplicate names and audit trail', async () => {
    const { admin, pkg } = await setup();
    expect(pkg).toMatchObject({ name: 'Champion', coins: 2500, pricePaise: 39900, active: true });

    const dup = await api().post('/api/v1/admin/coin-packages').set(auth(admin.token)).send({ name: 'champion', coins: 1, pricePaise: 100 });
    expect(dup.status).toBe(409);
    const bad = await api().post('/api/v1/admin/coin-packages').set(auth(admin.token)).send({ name: 'X', coins: -5, pricePaise: 1.5 });
    expect(bad.status).toBe(422);

    const upd = await api().patch(`/api/v1/admin/coin-packages/${pkg.id}`).set(auth(admin.token)).send({ pricePaise: 44900 });
    expect(upd.status).toBe(200);
    expect(upd.body.data.pricePaise).toBe(44900);

    const off = await api().patch(`/api/v1/admin/coin-packages/${pkg.id}/status`).set(auth(admin.token)).send({ active: false });
    expect(off.body.data.active).toBe(false);

    const actions = (await AuditLog.find().sort({ createdAt: 1 })).map((l) => l.action);
    expect(actions).toEqual(expect.arrayContaining(['PACKAGE_CREATED', 'PACKAGE_PRICE_CHANGED', 'PACKAGE_DISABLED']));

    const list = await api().get('/api/v1/admin/coin-packages').set(auth(admin.token));
    expect(list.body.data.items).toHaveLength(1);
  });

  test('players only see active packages and cannot manage them', async () => {
    const { admin, player, pkg } = await setup();
    await api().patch(`/api/v1/admin/coin-packages/${pkg.id}/status`).set(auth(admin.token)).send({ active: false });
    const res = await api().get('/api/v1/player/coin-packages').set(auth(player.token));
    expect(res.body.data.items).toHaveLength(0);

    const forbidden = await api().post('/api/v1/admin/coin-packages').set(auth(player.token)).send({ name: 'Free', coins: 1, pricePaise: 100 });
    expect(forbidden.status).toBe(403);

    const order = await api().post('/api/v1/player/coin-orders').set(auth(player.token)).send({ packageId: pkg.id });
    expect(order.status).toBe(404);
  });
});

describe('orders and payments', () => {
  test('client cannot choose the price', async () => {
    const { player, pkg } = await setup();
    const res = await api()
      .post('/api/v1/player/coin-orders')
      .set(auth(player.token))
      .send({ packageId: pkg.id, pricePaise: 1, coins: 999999 });
    expect(res.status).toBe(422);
  });

  test('order snapshots package price; later price change does not alter it', async () => {
    const { admin, player, pkg } = await setup();
    const { order, checkout } = await buyAndCreateOrder(player, pkg);
    expect(order).toMatchObject({ status: 'PENDING', amountPaise: 39900, coins: 2500 });
    expect(checkout).toMatchObject({ amountPaise: 39900, currency: 'INR', providerOrderId: order.providerOrderId });

    await api().patch(`/api/v1/admin/coin-packages/${pkg.id}`).set(auth(admin.token)).send({ pricePaise: 99900, coins: 10 });
    const stored = await Order.findById(order.id);
    expect(stored.package.pricePaise).toBe(39900);
    expect(stored.coins).toBe(2500);
  });

  test('invalid signature is rejected and nothing is credited', async () => {
    const { player, pkg } = await setup();
    const { order } = await buyAndCreateOrder(player, pkg);
    const res = await api()
      .post('/api/v1/payments/verify')
      .set(auth(player.token))
      .send({ providerOrderId: order.providerOrderId, providerPaymentId: 'pay_1', signature: 'forged' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_SIGNATURE');
    expect(await balance(player)).toBe(0);
  });

  test('verify credits once; repeated verify and webhook do not double credit', async () => {
    const { player, pkg } = await setup();
    const { order } = await buyAndCreateOrder(player, pkg);
    const body = {
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_abc',
      signature: provider.signCheckout(order.providerOrderId, 'pay_abc'),
    };

    const first = await api().post('/api/v1/payments/verify').set(auth(player.token)).send(body);
    expect(first.status).toBe(200);
    expect(first.body.data).toMatchObject({ alreadyProcessed: false, order: { status: 'PAID' } });

    const second = await api().post('/api/v1/payments/verify').set(auth(player.token)).send(body);
    expect(second.body.data.alreadyProcessed).toBe(true);

    const hook = await webhook('payment.captured', { id: 'pay_abc', order_id: order.providerOrderId, amount: 39900, currency: 'INR' });
    expect(hook.status).toBe(200);

    expect(await balance(player)).toBe(2500);
    expect(await Transaction.countDocuments({ userId: player.user._id })).toBe(1);

    const tx = await api().get('/api/v1/player/transactions').set(auth(player.token));
    expect(tx.body.data.items[0]).toMatchObject({ type: 'PURCHASE', amount: 2500, balanceAfter: 2500 });
    expect(tx.body.data.pagination).toMatchObject({ page: 1, total: 1 });
  });

  test('concurrent verify and webhook credit exactly once', async () => {
    const { player, pkg } = await setup();
    const { order } = await buyAndCreateOrder(player, pkg);
    const payment = { id: 'pay_race', order_id: order.providerOrderId, amount: 39900, currency: 'INR' };
    const verifyBody = {
      providerOrderId: order.providerOrderId,
      providerPaymentId: 'pay_race',
      signature: provider.signCheckout(order.providerOrderId, 'pay_race'),
    };
    const results = await Promise.all([
      api().post('/api/v1/payments/verify').set(auth(player.token)).send(verifyBody),
      webhook('payment.captured', payment),
      webhook('order.paid', payment),
      api().post('/api/v1/payments/verify').set(auth(player.token)).send(verifyBody),
    ]);
    for (const r of results) expect(r.status).toBe(200);
    expect(await balance(player)).toBe(2500);
    expect(await Transaction.countDocuments({ userId: player.user._id })).toBe(1);
  });

  test('webhook with bad signature or wrong amount does not credit', async () => {
    const { player, pkg } = await setup();
    const { order } = await buyAndCreateOrder(player, pkg);

    const forged = await api()
      .post('/api/v1/payments/webhook')
      .set('Content-Type', 'application/json')
      .set('X-Razorpay-Signature', 'bad')
      .send({ event: 'payment.captured' });
    expect(forged.status).toBe(400);

    const cheap = await webhook('payment.captured', { id: 'pay_x', order_id: order.providerOrderId, amount: 100, currency: 'INR' });
    expect(cheap.status).toBe(200);
    expect(cheap.body.data.outcome).toBe('rejected');
    expect(await balance(player)).toBe(0);
  });

  test('failed payment marks order FAILED; refund reverses coins', async () => {
    const { player, pkg } = await setup();
    const a = (await buyAndCreateOrder(player, pkg)).order;
    await webhook('payment.failed', { id: 'pay_f', order_id: a.providerOrderId, amount: 39900, currency: 'INR', error_description: 'Card declined' });
    const failed = await api().get(`/api/v1/player/coin-orders/${a.id}`).set(auth(player.token));
    expect(failed.body.data).toMatchObject({ status: 'FAILED', failureReason: 'Card declined' });

    const b = (await buyAndCreateOrder(player, pkg)).order;
    const payment = { id: 'pay_r', order_id: b.providerOrderId, amount: 39900, currency: 'INR' };
    await webhook('payment.captured', payment);
    expect(await balance(player)).toBe(2500);
    await webhook('refund.processed', payment, { refund: { entity: { payment_id: 'pay_r', amount: 39900 } } });
    expect(await balance(player)).toBe(0);
    expect((await Order.findById(b.id)).status).toBe('REFUNDED');
  });

  test('players cannot read other players orders', async () => {
    const { player, pkg } = await setup();
    const other = await asUser();
    const { order } = await buyAndCreateOrder(player, pkg);
    const res = await api().get(`/api/v1/player/coin-orders/${order.id}`).set(auth(other.token));
    expect(res.status).toBe(404);
  });

  test('ledger rows are immutable', async () => {
    const { player, pkg } = await setup();
    const { order } = await buyAndCreateOrder(player, pkg);
    await webhook('payment.captured', { id: 'pay_i', order_id: order.providerOrderId, amount: 39900, currency: 'INR' });
    await expect(Transaction.updateOne({}, { amount: 999999 })).rejects.toThrow(/immutable/);
    await expect(Transaction.deleteMany({})).rejects.toThrow(/immutable/);
  });

  test('admin dashboard counts only PAID orders as revenue', async () => {
    const { admin, player, pkg } = await setup();
    const paid = (await buyAndCreateOrder(player, pkg)).order;
    await buyAndCreateOrder(player, pkg); // stays PENDING
    await webhook('payment.captured', { id: 'pay_d', order_id: paid.providerOrderId, amount: 39900, currency: 'INR' });

    const res = await api().get('/api/v1/admin/dashboard').set(auth(admin.token));
    expect(res.status).toBe(200);
    expect(res.body.data).toMatchObject({ totalRevenuePaise: 39900, totalOrders: 1, pendingPayments: 1, totalPlayers: 1, newPlayersToday: 1 });

    const revenue = await api().get('/api/v1/admin/dashboard/revenue').set(auth(admin.token));
    expect(revenue.body.data.totals).toMatchObject({ revenuePaise: 39900, paidOrders: 1, coinsSold: 2500 });
    expect(revenue.body.data.series).toHaveLength(1);

    const payments = await api().get('/api/v1/admin/payments?status=PAID').set(auth(admin.token));
    expect(payments.body.data.items).toHaveLength(1);
    expect(payments.body.data.items[0].user.email).toBe(player.user.email);

    const byEmail = await api().get(`/api/v1/admin/payments?search=${encodeURIComponent(player.user.email)}`).set(auth(admin.token));
    expect(byEmail.body.data.pagination.total).toBe(2);

    const detail = await api().get(`/api/v1/admin/payments/${paid.id}`).set(auth(admin.token));
    expect(detail.body.data.ledger).toHaveLength(1);
  });
});
