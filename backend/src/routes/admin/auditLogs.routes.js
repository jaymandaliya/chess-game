const express = require('express');
const { z } = require('zod');
const AuditLog = require('../../models/AuditLog');
const validate = require('../../middleware/validate');
const { ok, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

// Read-only: there are deliberately no write routes for audit logs
const router = express.Router();

const auditQuery = listQuery(['createdAt'], {
  action: z.string().trim().max(60).optional(),
  actorId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
  targetType: z.string().trim().max(40).optional(),
  targetId: z.string().trim().max(60).optional(),
  outcome: z.enum(['SUCCESS', 'FAILURE']).optional(),
});

function buildFilter(q) {
  const filter = {};
  for (const key of ['action', 'actorId', 'targetType', 'targetId', 'outcome']) if (q[key]) filter[key] = q[key];
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    filter.$or = [{ actorEmail: re }, { action: re }];
  }
  const range = dateRange(q.from, q.to);
  if (range) filter.createdAt = range;
  return filter;
}

router.get('/', validate({ query: auditQuery }), async (req, res) => {
  const q = req.valid.query;
  return ok(res, await paginate(AuditLog, buildFilter(q), q));
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const log = await findByIdOr404(AuditLog, req.valid.params.id, 'Audit event not found');
  return ok(res, log);
});

module.exports = router;
module.exports.buildFilter = buildFilter;
module.exports.auditQuery = auditQuery;
