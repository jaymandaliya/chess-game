const express = require('express');
const { z } = require('zod');
const Tournament = require('../models/Tournament');
const Withdrawal = require('../models/Withdrawal');
const tournamentService = require('../services/tournamentService');
const kycService = require('../services/kycService');
const withdrawalService = require('../services/withdrawalService');
const walletService = require('../services/walletService');
const { getSettings } = require('../services/settingsService');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimits');
const { ok, created, findByIdOr404 } = require('../utils/http');
const { listQuery, paginate } = require('../utils/pagination');
const { idParam } = require('./schemas');

const router = express.Router();

// ---- Economy config the app needs (stake choices, fee, balances) ----

router.get('/economy', async (req, res) => {
  const [settings, balances] = await Promise.all([getSettings(), walletService.getBalances(req.user._id)]);
  return ok(res, {
    stakeOptions: settings.stakeOptions,
    winningsFeePercent: settings.winningsFeePercent,
    withdrawalsEnabled: settings.withdrawalsEnabled,
    balances,
  });
});

// ---- Tournaments ----

router.get(
  '/tournaments',
  validate({ query: z.object({ scope: z.enum(['open', 'mine', 'past']).default('open') }) }),
  async (req, res) => {
    const me = req.user._id;
    const filter =
      req.valid.query.scope === 'open'
        ? { status: { $in: ['REGISTRATION', 'RUNNING'] } }
        : req.valid.query.scope === 'mine'
          ? { 'players.userId': me }
          : { status: { $in: ['COMPLETED', 'CANCELLED'] } };
    const items = await Tournament.find(filter).sort({ startsAt: req.valid.query.scope === 'past' ? -1 : 1 }).limit(50);
    return ok(res, { items: items.map((t) => tournamentService.viewFor(t, me)) });
  },
);

router.get('/tournaments/:id', validate({ params: idParam }), async (req, res) => {
  const t = await findByIdOr404(Tournament, req.valid.params.id, 'Tournament not found');
  return ok(res, tournamentService.viewFor(t, req.user._id));
});

for (const action of ['join', 'leave', 'ready']) {
  router.post(`/tournaments/:id/${action}`, validate({ params: idParam }), async (req, res) => {
    const t = await tournamentService[action](req.user, req.valid.params.id);
    return ok(res, tournamentService.viewFor(t, req.user._id));
  });
}

// ---- KYC ----

router.get('/kyc', async (req, res) => ok(res, await kycService.getForUser(req.user._id)));

router.post('/kyc', limits.passwordResetLimiter, validate({ body: kycService.submitSchema }), async (req, res) =>
  created(res, await kycService.submit(req.user, req.valid.body)),
);

// ---- Withdrawals (coins → money) ----

router.get('/withdrawals/config', async (req, res) => ok(res, await withdrawalService.config(req.user._id)));

router.get('/withdrawals/quote', validate({ query: z.object({ coins: z.coerce.number().int().min(1) }) }), async (req, res) =>
  ok(res, withdrawalService.quote(req.valid.query.coins, await getSettings())),
);

router.get('/withdrawals', validate({ query: listQuery(['createdAt']) }), async (req, res) =>
  ok(res, await paginate(Withdrawal, { userId: req.user._id }, req.valid.query)),
);

router.post(
  '/withdrawals',
  limits.paymentLimiter,
  validate({ body: z.object({ coins: z.number().int().min(1).max(10_000_000) }).strict() }),
  async (req, res) => created(res, await withdrawalService.request(req.user, req.valid.body.coins, req)),
);

module.exports = router;
