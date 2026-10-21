const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function notFound(req, res) {
  res.status(404).json({ success: false, message: 'Route not found', code: 'NOT_FOUND' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Unexpected server error';
  let details;

  if (err instanceof AppError) {
    ({ status, code, message, details } = err);
  } else if (err.type === 'entity.parse.failed') {
    status = 400;
    code = 'INVALID_JSON';
    message = 'Request body is not valid JSON';
  } else if (err.type === 'entity.too.large') {
    status = 413;
    code = 'PAYLOAD_TOO_LARGE';
    message = 'Request body is too large';
  } else if (err.code === 11000) {
    status = 409;
    code = 'DUPLICATE';
    message = 'A record with the same value already exists';
  } else if (err.name === 'ValidationError') {
    status = 422;
    code = 'VALIDATION_ERROR';
    message = 'Validation failed';
    details = Object.values(err.errors || {}).map((e) => ({ path: e.path, message: e.message }));
  }

  if (status >= 500 && !(err instanceof AppError)) logger.error({ err, path: req.originalUrl }, 'Unhandled error');

  // Never expose stack traces or internal messages
  const body = { success: false, message, code };
  if (details) body.details = details;
  res.status(status).json(body);
}

module.exports = { notFound, errorHandler };
