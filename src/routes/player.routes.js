const express = require('express');
const { z } = require('zod');
const User = require('../models/User');
const CoinPackage = require('../models/CoinPackage');
const Order = require('../models/Order');
const Match = require('../models/Match');
const Transaction = require('../models/Transaction');
const walletService = require('../services/walletService');
const orderService = require('../services/orderService');
const { playerStats } = require('../services/statsService');
const gameManager = require('../game/gameManager');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimits');
const { ok, created, findByIdOr404 } = require('../utils/http');
const { listQuery, dateRange, paginate } = require('../utils/pagination');
const { displayNameSchema, idParam } = require('./schemas');

const router = express.Router();

// ---- Profile ----

function profile(user) {
  const { settings, ...rest } = user.toJSON();
  return rest;
}

router.get('/profile', (req, res) => ok(res, profile(req.user)));

// Only these fields are player-editable; anything else (role, rating, email...) is rejected
const profilePatch = z
  .object({
    displayName: displayNameSchema,
    avatarUrl: z.string().url().startsWith('https://').max(500).nullable(),
    country: z.string().length(2).toUpperCase().nullable(),
    bio: z.string().trim().max(200).nullable(),
  })
  .partial()
  .strict();

router.patch('/profile', validate({ body: profilePatch }), async (req, res) => {
  const set = {};
  const unset = {};
  for (const [k, v] of Object.entries(req.valid.body)) {
    if (v === null) unset[k] = 1;
    else set[k] = v;
  }
  const user = await User.findByIdAndUpdate(req.user._id, { $set: set, $unset: unset }, { new: true, runValidators: true });
  return ok(res, profile(user));
});

// ---- Preferences ----

const settingsPatch = z
  .object({
    boardTheme: z.enum(['classic', 'green', 'blue', 'wood']),
    pieceSet: z.enum(['standard', 'neo', 'alpha']),
    soundEnabled: z.boolean(),
    notificationsEnabled: z.boolean(),
    autoQueen: z.boolean(),
    showLegalMoves: z.boolean(),
    language: z.enum(['en', 'hi']),
  })
  .partial()
  .strict();

router.get('/settings', (req, res) => ok(res, req.user.settings));

router.patch('/settings', validate({ body: settingsPatch }), async (req, res) => {
  const set = {};
  for (const [k, v] of Object.entries(req.valid.body)) set[`settings.${k}`] = v;
  const user = await User.findByIdAndUpdate(req.user._id, { $set: set }, { new: true, runValidators: true });
  return ok(res, user.settings);
});

// ---- Match history & stats ----

function forPlayer(match, userId) {
  const json = match.toJSON();
  const color = String(match.white.userId) === String(userId) ? 'white' : 'black';
  let outcome = null;
  if (match.status === 'COMPLETED') {
    if (match.result === 'DRAW') outcome = 'draw';
    else outcome = (match.result === 'WHITE_WIN') === (color === 'white') ? 'win' : 'loss';
  }
  const me = match[color];
  return {
    ...json,
    color,
    outcome,
    opponent: color === 'white' ? json.black : json.white,
    ratingChange: me.ratingAfter != null && me.ratingBefore != null ? me.ratingAfter - me.ratingBefore : null,
  };
}

router.get(
  '/game-history',
  validate({
    query: listQuery(['startedAt', 'endedAt'], {
      mode: z.enum(Match.MODES).optional(),
      status: z.enum(Match.STATUSES).optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const me = req.user._id;
    const filter = { $or: [{ 'white.userId': me }, { 'black.userId': me }] };
    if (q.mode) filter.mode = q.mode;
    if (q.status) filter.status = q.status;
    const range = dateRange(q.from, q.to);
    if (range) filter.startedAt = range;

    const page = await paginate(Match, filter, q, { select: '-pgn' });
    return ok(res, { ...page, items: page.items.map((m) => forPlayer(m, me)) });
  },
);

router.get('/stats', async (req, res) => ok(res, await playerStats(req.user._id)));

// Lets the app resume an unfinished game after a restart
router.get('/active-game', (req, res) => ok(res, { gameId: gameManager.activeGameIdFor(req.user._id) }));

// ---- Wallet ----

router.get('/wallet', async (req, res) => {
  const { play, tournament } = await walletService.getBalances(req.user._id);
  return ok(res, { balance: play, tournamentBalance: tournament, currency: 'COIN' });
});

router.get(
  '/transactions',
  validate({
    query: listQuery(['createdAt', 'amount'], {
      type: z.enum(Transaction.TYPES).optional(),
      coinType: z.enum(['PLAY', 'TOURNAMENT']).optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = { userId: req.user._id };
    if (q.type) filter.type = q.type;
    if (q.coinType) filter.coinType = q.coinType;
    const range = dateRange(q.from, q.to);
    if (range) filter.createdAt = range;
    return ok(res, await paginate(Transaction, filter, q));
  },
);

// ---- Coin purchase ----

router.get('/coin-packages', async (req, res) => {
  const packages = await CoinPackage.find({ active: true }).sort({ sortOrder: 1, pricePaise: 1 });
  return ok(res, { items: packages });
});

router.post(
  '/coin-orders',
  limits.paymentLimiter,
  // Only the package id is accepted: price and coins are decided by the server
  validate({ body: z.object({ packageId: z.string() }).strict() }),
  async (req, res) => created(res, await orderService.createOrder(req.user, req.valid.body.packageId)),
);

router.get(
  '/coin-orders',
  validate({ query: listQuery(['createdAt'], { status: z.enum(Order.STATUSES).optional() }) }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = { userId: req.user._id };
    if (q.status) filter.status = q.status;
    return ok(res, await paginate(Order, filter, q));
  },
);

router.get('/coin-orders/:id', validate({ params: idParam }), async (req, res) => {
  const order = await findByIdOr404(
    (id) => Order.findOne({ _id: id, userId: req.user._id }),
    req.valid.params.id,
    'Order not found',
  );
  return ok(res, order);
});

router.use(require('./playerExtra.routes'));

module.exports = router;
