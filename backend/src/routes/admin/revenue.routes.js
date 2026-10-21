const express = require('express');
const { z } = require('zod');
const Order = require('../../models/Order');
const PlatformFee = require('../../models/PlatformFee');
const Withdrawal = require('../../models/Withdrawal');
const { getSettings } = require('../../services/settingsService');
const validate = require('../../middleware/validate');
const { ok } = require('../../utils/http');

const router = express.Router();

const SOURCES = ['COIN_SALE', 'REFUND', 'PLATFORM_FEE', 'WITHDRAWAL_PAID'];

// Each money/coin movement that matters to the business, normalised into one log shape
const sources = {
  COIN_SALE: {
    model: Order,
    filter: (range) => ({ status: { $in: ['PAID', 'REFUNDED'] }, ...(range ? { paidAt: range } : {}) }),
    dateField: 'paidAt',
    map: (o) => ({
      id: `sale:${o._id}`,
      at: o.paidAt,
      source: 'COIN_SALE',
      description: `${o.package.name}: ${o.coins} coins${o.tournamentCoins ? ` + ${o.tournamentCoins} tournament` : ''}`,
      user: o.userId && o.userId.displayName ? { id: String(o.userId._id), displayName: o.userId.displayName, email: o.userId.email } : null,
      amountPaise: o.amountPaise,
      direction: 'IN',
      ref: { type: 'ORDER', id: String(o._id), label: o.orderNumber },
    }),
  },
  REFUND: {
    model: Order,
    filter: (range) => ({ status: 'REFUNDED', ...(range ? { refundedAt: range } : {}) }),
    dateField: 'refundedAt',
    map: (o) => ({
      id: `refund:${o._id}`,
      at: o.refundedAt,
      source: 'REFUND',
      description: `Refund of ${o.orderNumber}`,
      user: o.userId && o.userId.displayName ? { id: String(o.userId._id), displayName: o.userId.displayName, email: o.userId.email } : null,
      amountPaise: o.amountPaise,
      direction: 'OUT',
      ref: { type: 'ORDER', id: String(o._id), label: o.orderNumber },
    }),
  },
  PLATFORM_FEE: {
    model: PlatformFee,
    filter: (range) => (range ? { createdAt: range } : {}),
    dateField: 'createdAt',
    populate: null,
    map: (f) => ({
      id: `fee:${f._id}`,
      at: f.createdAt,
      source: 'PLATFORM_FEE',
      description: `${f.feePercent}% fee on ${f.grossCoins} coin ${f.source === 'GAME' ? 'game pot' : 'tournament pool'}`,
      user: null,
      coins: f.coins,
      direction: 'IN',
      ref: { type: f.refType, id: f.refId, label: f.source === 'GAME' ? 'Game' : 'Tournament' },
    }),
  },
  WITHDRAWAL_PAID: {
    model: Withdrawal,
    filter: (range) => ({ status: 'PAID', ...(range ? { reviewedAt: range } : {}) }),
    dateField: 'reviewedAt',
    map: (w) => ({
      id: `withdrawal:${w._id}`,
      at: w.reviewedAt,
      source: 'WITHDRAWAL_PAID',
      description: `${w.coins} coins paid out (TDS ₹${(w.tdsPaise / 100).toFixed(2)})`,
      user: w.userId && w.userId.displayName ? { id: String(w.userId._id), displayName: w.userId.displayName, email: w.userId.email } : null,
      amountPaise: w.grossPaise,
      coins: w.coins,
      direction: 'OUT',
      ref: { type: 'WITHDRAWAL', id: String(w._id), label: w.requestNumber },
    }),
  },
};

async function fetchSource(key, range, take) {
  const s = sources[key];
  let query = s.model.find(s.filter(range)).sort({ [s.dateField]: -1 }).limit(take);
  if (s.populate !== null) query = query.populate('userId', 'displayName email');
  const [docs, total] = await Promise.all([query, s.model.countDocuments(s.filter(range))]);
  return { items: docs.map(s.map), total };
}

async function summary(range) {
  const [sales, refunds, fees, withdrawals, settings] = await Promise.all([
    Order.aggregate([{ $match: sources.COIN_SALE.filter(range) }, { $group: { _id: null, paise: { $sum: '$amountPaise' }, n: { $sum: 1 } } }]),
    Order.aggregate([{ $match: sources.REFUND.filter(range) }, { $group: { _id: null, paise: { $sum: '$amountPaise' }, n: { $sum: 1 } } }]),
    PlatformFee.aggregate([{ $match: sources.PLATFORM_FEE.filter(range) }, { $group: { _id: '$source', coins: { $sum: '$coins' } } }]),
    Withdrawal.aggregate([
      { $match: sources.WITHDRAWAL_PAID.filter(range) },
      { $group: { _id: null, gross: { $sum: '$grossPaise' }, net: { $sum: '$netPaise' }, tds: { $sum: '$tdsPaise' }, n: { $sum: 1 } } },
    ]),
    getSettings(),
  ]);
  const feeBy = Object.fromEntries(fees.map((f) => [f._id, f.coins]));
  const feeCoins = (feeBy.GAME || 0) + (feeBy.TOURNAMENT || 0);
  const salesPaise = sales[0]?.paise || 0;
  const refundsPaise = refunds[0]?.paise || 0;
  const withdrawalsPaise = withdrawals[0]?.gross || 0;
  return {
    salesPaise,
    salesCount: sales[0]?.n || 0,
    refundsPaise,
    withdrawalsPaise,
    withdrawalsCount: withdrawals[0]?.n || 0,
    tdsPaise: withdrawals[0]?.tds || 0,
    netCashPaise: salesPaise - refundsPaise - withdrawalsPaise,
    feeCoins,
    gameFeeCoins: feeBy.GAME || 0,
    tournamentFeeCoins: feeBy.TOURNAMENT || 0,
    // Value of fee coins at the current withdrawal rate (what they would cost to pay out)
    feeValuePaise: feeCoins * settings.coinValuePaise,
  };
}

router.get(
  '/',
  validate({
    query: z.object({
      source: z.enum(['ALL', ...SOURCES]).default('ALL'),
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(25),
      from: z.coerce.date().optional(),
      to: z.coerce.date().optional(),
    }),
  }),
  async (req, res) => {
    const q = req.valid.query;
    const range = q.from || q.to ? { ...(q.from ? { $gte: q.from } : {}), ...(q.to ? { $lte: q.to } : {}) } : undefined;
    const keys = q.source === 'ALL' ? SOURCES : [q.source];
    const take = q.page * q.limit;
    const parts = await Promise.all(keys.map((k) => fetchSource(k, range, take)));
    const merged = parts
      .flatMap((p) => p.items)
      .filter((i) => i.at)
      .sort((a, b) => b.at - a.at)
      .slice((q.page - 1) * q.limit, take);
    const total = parts.reduce((s, p) => s + p.total, 0);
    return ok(res, {
      summary: await summary(range),
      items: merged,
      pagination: { page: q.page, limit: q.limit, total, totalPages: Math.ceil(total / q.limit) },
    });
  },
);

module.exports = router;
module.exports.summary = summary;
