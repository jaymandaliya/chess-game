const express = require('express');
const { z } = require('zod');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Match = require('../../models/Match');
const AuditLog = require('../../models/AuditLog');
const reportService = require('../../services/reportService');
const { audit } = require('../../services/auditService');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { ok, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange } = require('../../utils/pagination');
const { toCsv } = require('../../utils/csv');
const { rangeQuery, resolveRange } = require('./dashboard.routes');
const payments = require('./payments.routes');
const gameActivity = require('./gameActivity.routes');
const auditLogs = require('./auditLogs.routes');

const router = express.Router();

const MAX_EXPORT_ROWS = 50_000;

router.get(
  '/',
  validate({ query: rangeQuery.extend({ type: z.enum(['overview', 'revenue', 'players', 'matches']).default('overview') }) }),
  async (req, res) => {
    const range = resolveRange(req.valid.query);
    const { type } = req.valid.query;
    if (type === 'revenue') return ok(res, { type, ...(await reportService.revenue(range)) });
    if (type === 'players') return ok(res, { type, ...(await reportService.playersReport(range)) });
    if (type === 'matches') return ok(res, { type, ...(await reportService.matchesReport(range)) });

    const [revenue, players, matches] = await Promise.all([
      reportService.revenue(range),
      reportService.playersReport(range),
      reportService.matchesReport(range),
    ]);
    return ok(res, { type, from: revenue.from, to: revenue.to, revenue, players, matches });
  },
);

function parseFilters(schema, query) {
  const result = schema.safeParse(query);
  if (!result.success) {
    const details = result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message }));
    throw AppError.unprocessable('Validation failed', 'VALIDATION_ERROR', details);
  }
  return result.data;
}

const playersQuery = listQuery(['createdAt'], {
  status: z.enum(User.STATUSES).optional(),
  role: z.enum(User.ROLES).default('PLAYER'),
});

// Each export reuses the same filters as its list endpoint
const exporters = {
  payments: {
    schema: payments.paymentsQuery,
    async rows(q) {
      const orders = await Order.find(await payments.buildFilter(q))
        .sort({ createdAt: -1 })
        .limit(MAX_EXPORT_ROWS)
        .populate('userId', 'displayName email');
      return orders.map(payments.paymentRow);
    },
    columns: [
      { header: 'Order number', value: (r) => r.orderNumber },
      { header: 'User ID', value: (r) => r.user.id },
      { header: 'Display name', value: (r) => r.user.displayName },
      { header: 'Email', value: (r) => r.user.email },
      { header: 'Package', value: (r) => r.package.name },
      { header: 'Coins', value: (r) => r.coins },
      { header: 'Amount (paise)', value: (r) => r.amountPaise },
      { header: 'Currency', value: (r) => r.currency },
      { header: 'Status', value: (r) => r.status },
      { header: 'Provider order ID', value: (r) => r.providerOrderId },
      { header: 'Provider payment ID', value: (r) => r.providerPaymentId },
      { header: 'Created at', value: (r) => r.createdAt },
      { header: 'Paid at', value: (r) => r.paidAt },
    ],
  },
  players: {
    schema: playersQuery,
    async rows(q) {
      const filter = { role: q.role };
      if (q.status) filter.status = q.status;
      if (q.search) {
        const re = new RegExp(escapeRegex(q.search), 'i');
        filter.$or = [{ displayName: re }, { email: re }];
      }
      const range = dateRange(q.from, q.to);
      if (range) filter.createdAt = range;
      return User.find(filter).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
    },
    columns: [
      { header: 'User ID', value: (u) => u._id },
      { header: 'Display name', value: (u) => u.displayName },
      { header: 'Email', value: (u) => u.email },
      { header: 'Role', value: (u) => u.role },
      { header: 'Status', value: (u) => u.status },
      { header: 'Rating', value: (u) => u.rating },
      { header: 'Joined at', value: (u) => u.createdAt },
      { header: 'Last active at', value: (u) => u.lastActiveAt },
    ],
  },
  matches: {
    schema: gameActivity.matchesQuery,
    async rows(q) {
      return Match.find(gameActivity.buildFilter(q)).select('-pgn').sort({ startedAt: -1 }).limit(MAX_EXPORT_ROWS);
    },
    columns: [
      { header: 'Match ID', value: (m) => m._id },
      { header: 'White', value: (m) => m.white.displayName },
      { header: 'Black', value: (m) => m.black.displayName },
      { header: 'Mode', value: (m) => m.mode },
      { header: 'Time control', value: (m) => m.timeControl && m.timeControl.label },
      { header: 'Status', value: (m) => m.status },
      { header: 'Result', value: (m) => m.result },
      { header: 'Termination', value: (m) => m.termination },
      { header: 'Moves', value: (m) => m.moveCount },
      { header: 'Started at', value: (m) => m.startedAt },
      { header: 'Ended at', value: (m) => m.endedAt },
    ],
  },
  'audit-logs': {
    schema: auditLogs.auditQuery,
    async rows(q) {
      return AuditLog.find(auditLogs.buildFilter(q)).sort({ createdAt: -1 }).limit(MAX_EXPORT_ROWS);
    },
    columns: [
      { header: 'Event ID', value: (l) => l._id },
      { header: 'Time', value: (l) => l.createdAt },
      { header: 'Actor', value: (l) => l.actorEmail },
      { header: 'Actor role', value: (l) => l.actorRole },
      { header: 'Action', value: (l) => l.action },
      { header: 'Target type', value: (l) => l.targetType },
      { header: 'Target ID', value: (l) => l.targetId },
      { header: 'Outcome', value: (l) => l.outcome },
      { header: 'Metadata', value: (l) => (l.metadata ? JSON.stringify(l.metadata) : '') },
    ],
  },
};

router.get(
  '/export',
  validate({ query: z.object({ type: z.enum(Object.keys(exporters)), format: z.enum(['csv']).default('csv') }).passthrough() }),
  async (req, res) => {
    const { type } = req.valid.query;
    const exporter = exporters[type];
    const filters = parseFilters(exporter.schema, req.query);
    const rows = await exporter.rows(filters);

    const { page, limit, sortBy, sortOrder, ...appliedFilters } = filters;
    await audit(req, { action: 'REPORT_EXPORTED', targetType: 'REPORT', targetId: type, metadata: { rows: rows.length, filters: appliedFilters } });

    const stamp = new Date().toISOString().slice(0, 10);
    res.set('Content-Type', 'text/csv; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="${type}-${stamp}.csv"`);
    res.set('X-Row-Count', String(rows.length));
    res.set('X-Truncated', String(rows.length >= MAX_EXPORT_ROWS));
    return res.send(toCsv(exporter.columns, rows));
  },
);

module.exports = router;
