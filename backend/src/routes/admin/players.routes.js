const express = require('express');
const { z } = require('zod');
const User = require('../../models/User');
const Order = require('../../models/Order');
const Transaction = require('../../models/Transaction');
const Match = require('../../models/Match');
const Tournament = require('../../models/Tournament');
const Withdrawal = require('../../models/Withdrawal');
const KycProfile = require('../../models/KycProfile');
const AuditLog = require('../../models/AuditLog');
const kycService = require('../../services/kycService');
const walletService = require('../../services/walletService');
const tokenService = require('../../services/tokenService');
const { playerStats } = require('../../services/statsService');
const { audit } = require('../../services/auditService');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { ok, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

const router = express.Router();

router.get(
  '/',
  validate({
    query: listQuery(['createdAt', 'displayName', 'rating', 'lastActiveAt', 'lastLoginAt'], {
      status: z.enum(User.STATUSES).optional(),
      role: z.enum(User.ROLES).default('PLAYER'),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = { role: q.role };
    if (q.status) filter.status = q.status;
    if (q.search) {
      const re = new RegExp(escapeRegex(q.search), 'i');
      filter.$or = [{ displayName: re }, { email: re }];
    }
    const range = dateRange(q.from, q.to);
    if (range) filter.createdAt = range;
    return ok(res, await paginate(User, filter, q, { select: '-settings' }));
  },
);

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const user = await findByIdOr404(User, req.valid.params.id, 'Player not found');
  const [balances, stats, recentOrders, orderTotals] = await Promise.all([
    walletService.getBalances(user._id),
    playerStats(user._id),
    Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(5),
    Order.aggregate([
      { $match: { userId: user._id, status: 'PAID' } },
      { $group: { _id: null, spentPaise: { $sum: '$amountPaise' }, orders: { $sum: 1 } } },
    ]),
  ]);
  return ok(res, {
    player: user,
    wallet: { balance: balances.play, tournamentBalance: balances.tournament, currency: 'COIN' },
    stats,
    purchases: {
      paidOrders: orderTotals[0] ? orderTotals[0].orders : 0,
      totalSpentPaise: orderTotals[0] ? orderTotals[0].spentPaise : 0,
      recentOrders,
    },
  });
});

// Full coin ledger of one player (both coin types), paginated
router.get(
  '/:id/transactions',
  validate({
    params: idParam,
    query: listQuery(['createdAt', 'amount'], {
      coinType: z.enum(['PLAY', 'TOURNAMENT']).optional(),
      type: z.enum(Transaction.TYPES).optional(),
    }),
  }),
  async (req, res) => {
    const user = await findByIdOr404(User, req.valid.params.id, 'Player not found');
    const q = req.valid.query;
    const filter = { userId: user._id };
    if (q.coinType) filter.coinType = q.coinType;
    if (q.type) filter.type = q.type;
    const range = dateRange(q.from, q.to);
    if (range) filter.createdAt = range;
    return ok(res, await paginate(Transaction, filter, q));
  },
);

// Everything one player did, newest first: purchases, coin movements, games, tournaments,
// withdrawals, KYC and account events
router.get('/:id/activity', validate({ params: idParam }), async (req, res) => {
  const user = await findByIdOr404(User, req.valid.params.id, 'Player not found');
  const uid = user._id;
  const [orders, txs, matches, tournaments, withdrawals, kyc, logs] = await Promise.all([
    Order.find({ userId: uid }).sort({ createdAt: -1 }).limit(30),
    Transaction.find({ userId: uid }).sort({ createdAt: -1 }).limit(60),
    Match.find({ $or: [{ 'white.userId': uid }, { 'black.userId': uid }] }).select('-pgn').sort({ startedAt: -1 }).limit(30),
    Tournament.find({ 'players.userId': uid }).select('-rounds').sort({ startsAt: -1 }).limit(20),
    Withdrawal.find({ userId: uid }).sort({ createdAt: -1 }).limit(20),
    KycProfile.findOne({ userId: uid }),
    AuditLog.find({ $or: [{ actorId: uid }, { targetId: String(uid) }] }).sort({ createdAt: -1 }).limit(30),
  ]);

  const timeline = [
    ...orders.map((o) => ({ at: o.createdAt, kind: 'ORDER', title: `Order ${o.orderNumber} · ${o.package.name}`, detail: o.status, amountPaise: o.amountPaise, refId: String(o._id) })),
    ...txs.map((t) => ({ at: t.createdAt, kind: 'COINS', title: t.description || t.type, detail: `${t.coinType} · balance ${t.balanceAfter}`, coins: t.amount, refId: String(t._id) })),
    ...matches.map((m) => ({
      at: m.startedAt,
      kind: 'GAME',
      title: `${m.white.displayName} vs ${m.black.displayName}`,
      detail: `${m.mode}${m.stakeCoins ? ` · ${m.stakeCoins} coin entry` : ''} · ${m.result || m.status}`,
      refId: String(m._id),
    })),
    ...tournaments.map((t) => ({ at: t.startsAt, kind: 'TOURNAMENT', title: t.name, detail: t.status, refId: String(t._id) })),
    ...withdrawals.map((w) => ({ at: w.createdAt, kind: 'WITHDRAWAL', title: `Withdrawal ${w.requestNumber}`, detail: w.status, coins: -w.coins, amountPaise: w.netPaise, refId: String(w._id) })),
    ...logs.map((l) => ({ at: l.createdAt, kind: 'ACCOUNT', title: l.action, detail: l.actorEmail ? `by ${l.actorEmail}` : '', refId: String(l._id) })),
  ]
    .filter((e) => e.at)
    .sort((a, b) => b.at - a.at)
    .slice(0, 150);

  return ok(res, {
    balances: await walletService.getBalances(uid),
    kyc: kycService.publicView(kyc),
    timeline,
    orders,
    transactions: txs,
    matches,
    tournaments: tournaments.map((t) => ({ id: String(t._id), name: t.name, status: t.status, startsAt: t.startsAt, entryFee: t.entryFee })),
    withdrawals,
  });
});

const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

// Admins manage players; only super admins manage other admins; nobody changes their own account here
function assertCanManage(actor, target) {
  if (String(actor._id) === String(target._id)) {
    throw AppError.forbidden('You cannot change your own account', 'SELF_MODIFICATION');
  }
  if (ADMIN_ROLES.includes(target.role) && actor.role !== 'SUPER_ADMIN') {
    throw AppError.forbidden('Only a super admin can manage admin accounts');
  }
}

router.patch(
  '/:id/status',
  validate({
    params: idParam,
    body: z.object({ status: z.enum(User.STATUSES), reason: z.string().trim().max(300).optional() }).strict(),
  }),
  async (req, res) => {
    const { status, reason } = req.valid.body;
    const target = await findByIdOr404(User, req.valid.params.id, 'Player not found');
    assertCanManage(req.user, target);

    const previous = target.status;
    if (previous !== status) {
      target.status = status;
      target.suspendedAt = status === 'SUSPENDED' ? new Date() : undefined;
      target.suspendedReason = status === 'SUSPENDED' ? reason : undefined;
      await target.save();
      if (status === 'SUSPENDED') await tokenService.revokeAllForUser(target._id, 'SUSPENDED');
    }

    await audit(req, {
      action: status === 'SUSPENDED' ? 'PLAYER_SUSPENDED' : 'PLAYER_ACTIVATED',
      targetType: 'USER',
      targetId: target._id,
      metadata: { from: previous, to: status, reason },
    });
    return ok(res, target);
  },
);

router.patch(
  '/:id/role',
  requireRole('SUPER_ADMIN'),
  validate({ params: idParam, body: z.object({ role: z.enum(User.ROLES) }).strict() }),
  async (req, res) => {
    const { role } = req.valid.body;
    const target = await findByIdOr404(User, req.valid.params.id, 'Player not found');
    assertCanManage(req.user, target);

    if (target.role === 'SUPER_ADMIN' && role !== 'SUPER_ADMIN') {
      const superAdmins = await User.countDocuments({ role: 'SUPER_ADMIN', status: 'ACTIVE' });
      if (superAdmins <= 1) throw AppError.conflict('Cannot remove the last super admin', 'LAST_SUPER_ADMIN');
    }

    const previous = target.role;
    if (previous !== role) {
      target.role = role;
      await target.save();
      // Force a fresh sign-in so tokens and portal access match the new role
      await tokenService.revokeAllForUser(target._id, 'ROLE_CHANGED');
    }

    await audit(req, {
      action: 'ROLE_CHANGED',
      targetType: 'USER',
      targetId: target._id,
      metadata: { from: previous, to: role },
    });
    return ok(res, target);
  },
);

module.exports = router;
