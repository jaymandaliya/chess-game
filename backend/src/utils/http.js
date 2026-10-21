const mongoose = require('mongoose');
const AppError = require('./AppError');

function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function created(res, data) {
  return ok(res, data, 201);
}

function isObjectId(id) {
  return typeof id === 'string' && /^[a-f\d]{24}$/i.test(id) && mongoose.isValidObjectId(id);
}

// Invalid ids are reported as 404 so callers cannot probe id formats
async function findByIdOr404(query, id, message) {
  if (!isObjectId(id)) throw AppError.notFound(message);
  // `query` is a Model (itself a function) or a custom lookup callback
  const doc = await (typeof query.findById === 'function' ? query.findById(id) : query(id));
  if (!doc) throw AppError.notFound(message);
  return doc;
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clientMeta(req) {
  return { ip: req.ip, userAgent: (req.get('user-agent') || '').slice(0, 300) };
}

module.exports = { ok, created, isObjectId, findByIdOr404, escapeRegex, clientMeta };
