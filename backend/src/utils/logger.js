const pino = require('pino');
const env = require('../config/env');

const logger = pino({
  level: process.env.LOG_LEVEL || (env.isTest ? 'silent' : 'info'),
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-razorpay-signature"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});

module.exports = logger;
