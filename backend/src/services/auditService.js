const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

const SENSITIVE_KEY = /password|token|secret|signature|authorization|cookie/i;

function sanitize(value, depth = 0) {
  if (value === null || value === undefined || depth > 4) return value;
  if (Array.isArray(value)) return value.slice(0, 50).map((v) => sanitize(v, depth + 1));
  if (value instanceof Date) return value;
  if (typeof value === 'object') {
    const out = {};
    for (const [key, v] of Object.entries(value)) {
      out[key] = SENSITIVE_KEY.test(key) ? '[REDACTED]' : sanitize(v, depth + 1);
    }
    return out;
  }
  if (typeof value === 'string') return value.slice(0, 500);
  return value;
}

async function audit(req, { action, targetType, targetId, outcome = 'SUCCESS', metadata }, session) {
  const actor = req && req.user;
  const doc = {
    actorId: actor ? actor._id : undefined,
    actorEmail: actor ? actor.email : undefined,
    actorRole: actor ? actor.role : undefined,
    action,
    targetType,
    targetId: targetId ? String(targetId) : undefined,
    outcome,
    metadata: sanitize(metadata),
    ip: req ? req.ip : undefined,
    userAgent: req ? (req.get('user-agent') || '').slice(0, 300) : undefined,
  };
  try {
    await AuditLog.create([doc], session ? { session } : undefined);
  } catch (err) {
    // Inside a transaction the caller must fail too; outside, never block the request
    if (session) throw err;
    logger.error({ err, action }, 'Failed to write audit log');
  }
}

module.exports = { audit, sanitize };
