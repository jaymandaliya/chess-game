const rateLimit = require('express-rate-limit');
const env = require('../config/env');

function limiter(windowMinutes, max) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => env.isTest,
    handler: (req, res) =>
      res.status(429).json({ success: false, message: 'Too many requests, try again later', code: 'RATE_LIMITED' }),
  });
}

module.exports = {
  loginLimiter: limiter(15, 10),
  registerLimiter: limiter(60, 10),
  passwordResetLimiter: limiter(15, 5),
  refreshLimiter: limiter(15, 60),
  paymentLimiter: limiter(15, 30),
};
