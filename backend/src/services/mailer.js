const env = require('../config/env');
const logger = require('../utils/logger');

// TODO: plug in a real provider (AWS SES, SendGrid, SMTP). Until then the link is only logged outside production.
async function sendPasswordReset(email, token) {
  const link = `${env.appUrl}/reset-password?token=${encodeURIComponent(token)}`;
  if (env.isProd) {
    logger.warn({ email }, 'Email provider not configured; password reset email not sent');
    return;
  }
  logger.info({ email, link }, 'Password reset link (development only)');
}

module.exports = { sendPasswordReset };
