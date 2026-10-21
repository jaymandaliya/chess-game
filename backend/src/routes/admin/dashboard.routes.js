const express = require('express');
const { z } = require('zod');
const reportService = require('../../services/reportService');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { ok } = require('../../utils/http');
const { daysAgo } = require('../../utils/time');

const router = express.Router();

const MAX_RANGE_DAYS = 366;

// Defaults to the last 30 days; ranges are capped to keep aggregations cheap
const rangeQuery = z.object({
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  groupBy: z.enum(['day', 'month']).default('day'),
});

function resolveRange(q) {
  const to = q.to || new Date();
  const from = q.from || daysAgo(30, to);
  if (from > to) throw AppError.unprocessable('"from" must be before "to"');
  if (to - from > MAX_RANGE_DAYS * 24 * 60 * 60 * 1000) {
    throw AppError.unprocessable(`Date range cannot exceed ${MAX_RANGE_DAYS} days`);
  }
  return { from, to, groupBy: q.groupBy };
}

router.get('/', async (req, res) => ok(res, await reportService.dashboardSummary()));

router.get('/revenue', validate({ query: rangeQuery }), async (req, res) =>
  ok(res, await reportService.revenue(resolveRange(req.valid.query))),
);

router.get(
  '/activity',
  validate({ query: z.object({ limit: z.coerce.number().int().min(1).max(100).default(20) }) }),
  async (req, res) => ok(res, { items: await reportService.activityFeed(req.valid.query.limit) }),
);

module.exports = router;
module.exports.rangeQuery = rangeQuery;
module.exports.resolveRange = resolveRange;
