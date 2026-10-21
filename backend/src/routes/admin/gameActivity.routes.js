const express = require('express');
const { z } = require('zod');
const Match = require('../../models/Match');
const validate = require('../../middleware/validate');
const { ok, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

const router = express.Router();

const matchesQuery = listQuery(['startedAt', 'endedAt', 'moveCount'], {
  status: z.enum(Match.STATUSES).optional(),
  mode: z.enum(Match.MODES).optional(),
  result: z.enum(Match.RESULTS).optional(),
  playerId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

function buildFilter(q) {
  const filter = {};
  for (const key of ['status', 'mode', 'result']) if (q[key]) filter[key] = q[key];
  const and = [];
  if (q.playerId) and.push({ $or: [{ 'white.userId': q.playerId }, { 'black.userId': q.playerId }] });
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    and.push({ $or: [{ 'white.displayName': re }, { 'black.displayName': re }] });
  }
  if (and.length) filter.$and = and;
  const range = dateRange(q.from, q.to);
  if (range) filter.startedAt = range;
  return filter;
}

router.get('/', validate({ query: matchesQuery }), async (req, res) => {
  const q = req.valid.query;
  return ok(res, await paginate(Match, buildFilter(q), q, { select: '-pgn' }));
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const match = await findByIdOr404(Match, req.valid.params.id, 'Match not found');
  return ok(res, match);
});

module.exports = router;
module.exports.buildFilter = buildFilter;
module.exports.matchesQuery = matchesQuery;
