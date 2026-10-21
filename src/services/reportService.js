const env = require('../config/env');
const User = require('../models/User');
const Order = require('../models/Order');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const { startOfDayIST, daysAgo } = require('../utils/time');

const ACTIVE_WINDOW_DAYS = 30;

function periodFormat(groupBy) {
  return groupBy === 'month' ? '%Y-%m' : '%Y-%m-%d';
}

function countBy(rows) {
  return Object.fromEntries(rows.map((r) => [r._id ?? 'UNKNOWN', r.count]));
}

/*
 * Revenue = sum of amountPaise of orders with status PAID, bucketed by paidAt.
 * PENDING, FAILED and REFUNDED orders are excluded.
 */
async function revenue({ from, to, groupBy = 'day' }) {
  const paidAt = { $gte: from, $lte: to };
  const [totals, series, statusRows] = await Promise.all([
    Order.aggregate([
      { $match: { status: 'PAID', paidAt } },
      { $group: { _id: null, revenuePaise: { $sum: '$amountPaise' }, paidOrders: { $sum: 1 }, coinsSold: { $sum: '$coins' } } },
    ]),
    Order.aggregate([
      { $match: { status: 'PAID', paidAt } },
      {
        $group: {
          _id: { $dateToString: { date: '$paidAt', format: periodFormat(groupBy), timezone: env.timezone } },
          revenuePaise: { $sum: '$amountPaise' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    Order.aggregate([
      { $match: { createdAt: { $gte: from, $lte: to } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
  ]);
  const t = totals[0] || { revenuePaise: 0, paidOrders: 0, coinsSold: 0 };
  return {
    from: from.toISOString(),
    to: to.toISOString(),
    groupBy,
    totals: { revenuePaise: t.revenuePaise, paidOrders: t.paidOrders, coinsSold: t.coinsSold },
    ordersByStatus: { PENDING: 0, PAID: 0, FAILED: 0, REFUNDED: 0, ...countBy(statusRows) },
    series: series.map((s) => ({ period: s._id, revenuePaise: s.revenuePaise, orders: s.orders })),
  };
}

async function playersReport({ from, to, groupBy = 'day' }) {
  const [signups, byStatus] = await Promise.all([
    User.aggregate([
      { $match: { role: 'PLAYER', createdAt: { $gte: from, $lte: to } } },
      {
        $group: {
          _id: { $dateToString: { date: '$createdAt', format: periodFormat(groupBy), timezone: env.timezone } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
    User.aggregate([{ $match: { role: 'PLAYER' } }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
  ]);
  return {
    newPlayers: signups.reduce((sum, s) => sum + s.count, 0),
    playersByStatus: countBy(byStatus),
    series: signups.map((s) => ({ period: s._id, newPlayers: s.count })),
  };
}

async function matchesReport({ from, to, groupBy = 'day' }) {
  const match = { startedAt: { $gte: from, $lte: to } };
  const [byResult, byMode, byTermination, series] = await Promise.all([
    Match.aggregate([{ $match: match }, { $group: { _id: '$result', count: { $sum: 1 } } }]),
    Match.aggregate([{ $match: match }, { $group: { _id: '$mode', count: { $sum: 1 } } }]),
    Match.aggregate([{ $match: { ...match, status: 'COMPLETED' } }, { $group: { _id: '$termination', count: { $sum: 1 } } }]),
    Match.aggregate([
      { $match: match },
      {
        $group: {
          _id: { $dateToString: { date: '$startedAt', format: periodFormat(groupBy), timezone: env.timezone } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);
  return {
    byResult: countBy(byResult),
    byMode: countBy(byMode),
    byTermination: countBy(byTermination),
    series: series.map((s) => ({ period: s._id, matches: s.count })),
  };
}

// Merged feed of admin actions, signups, purchases and finished matches
async function activityFeed(limit = 20) {
  const [logs, users, orders, matches] = await Promise.all([
    AuditLog.find({ actorRole: { $in: ['ADMIN', 'SUPER_ADMIN'] } }).sort({ createdAt: -1 }).limit(limit),
    User.find({ role: 'PLAYER' }).sort({ createdAt: -1 }).limit(limit).select('displayName createdAt'),
    Order.find({ status: 'PAID' }).sort({ paidAt: -1 }).limit(limit).populate('userId', 'displayName'),
    Match.find({ status: 'COMPLETED' }).sort({ endedAt: -1 }).limit(limit).select('white black result endedAt mode'),
  ]);

  const items = [
    ...logs.map((l) => ({
      type: 'ADMIN_ACTION',
      at: l.createdAt,
      message: `${l.actorEmail} ${l.action.toLowerCase().replace(/_/g, ' ')}`,
      refType: 'AUDIT_LOG',
      refId: String(l._id),
    })),
    ...users.map((u) => ({
      type: 'PLAYER_SIGNUP',
      at: u.createdAt,
      message: `${u.displayName} joined`,
      refType: 'USER',
      refId: String(u._id),
    })),
    ...orders.map((o) => ({
      type: 'COIN_PURCHASE',
      at: o.paidAt,
      message: `${o.userId ? o.userId.displayName : 'A player'} bought ${o.package.name} (${o.coins} coins)`,
      refType: 'ORDER',
      refId: String(o._id),
    })),
    ...matches.map((m) => ({
      type: 'MATCH_COMPLETED',
      at: m.endedAt,
      message: `${m.white.displayName} vs ${m.black.displayName}: ${m.result}`,
      refType: 'MATCH',
      refId: String(m._id),
    })),
  ];
  return items
    .filter((i) => i.at)
    .sort((a, b) => b.at - a.at)
    .slice(0, limit)
    .map((i) => ({ ...i, at: i.at.toISOString() }));
}

async function dashboardSummary() {
  const today = startOfDayIST();
  const [
    totalPlayers, activePlayers, revenueRow, totalOrders, pendingPayments, completedMatches, newPlayersToday, recentActivity,
  ] = await Promise.all([
    User.countDocuments({ role: 'PLAYER' }),
    User.countDocuments({ role: 'PLAYER', status: 'ACTIVE', lastActiveAt: { $gte: daysAgo(ACTIVE_WINDOW_DAYS) } }),
    Order.aggregate([{ $match: { status: 'PAID' } }, { $group: { _id: null, total: { $sum: '$amountPaise' } } }]),
    Order.countDocuments({ status: 'PAID' }),
    Order.countDocuments({ status: 'PENDING' }),
    Match.countDocuments({ status: 'COMPLETED' }),
    User.countDocuments({ role: 'PLAYER', createdAt: { $gte: today } }),
    activityFeed(10),
  ]);
  return {
    totalPlayers,
    activePlayers,
    totalRevenuePaise: revenueRow[0] ? revenueRow[0].total : 0,
    totalOrders,
    pendingPayments,
    completedMatches,
    newPlayersToday,
    recentActivity,
  };
}

module.exports = { revenue, playersReport, matchesReport, activityFeed, dashboardSummary, ACTIVE_WINDOW_DAYS };
