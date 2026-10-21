const crypto = require('crypto');
const express = require('express');
const { z } = require('zod');
const env = require('../config/env');
const User = require('../models/User');
const Wallet = require('../models/Wallet');
const PasswordReset = require('../models/PasswordReset');
const tokenService = require('../services/tokenService');
const { audit } = require('../services/auditService');
const { getSettings } = require('../services/settingsService');
const { sendPasswordReset } = require('../services/mailer');
const { authenticate } = require('../middleware/auth');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimits');
const AppError = require('../utils/AppError');
const { ok, clientMeta } = require('../utils/http');
const { passwordSchema, hashPassword, verifyPassword } = require('../utils/password');
const { displayNameSchema } = require('./schemas');

const router = express.Router();

const REFRESH_COOKIE = 'rt';
const RESET_TOKEN_TTL_MS = 30 * 60 * 1000;
const ADMIN_ROLES = ['ADMIN', 'SUPER_ADMIN'];

function publicUser(user) {
  return {
    id: String(user._id),
    displayName: user.displayName,
    email: user.email,
    role: user.role,
    status: user.status,
    avatarUrl: user.avatarUrl || null,
    rating: user.rating,
  };
}

// Web clients (admin portal) get the refresh token as an httpOnly cookie; mobile gets it in the body
function isWebClient(req) {
  return req.get('x-client-type') === 'web';
}

function cookieOptions(expires) {
  return { httpOnly: true, secure: env.isProd, sameSite: 'strict', path: '/api/v1/auth', expires };
}

function sendSession(req, res, user, tokens, status = 200) {
  const data = {
    user: publicUser(user),
    accessToken: tokens.accessToken,
    accessTokenExpiresIn: tokens.accessTokenExpiresIn,
  };
  if (isWebClient(req)) {
    res.cookie(REFRESH_COOKIE, tokens.refreshToken, cookieOptions(new Date(tokens.refreshTokenExpiresAt)));
  } else {
    data.refreshToken = tokens.refreshToken;
    data.refreshTokenExpiresAt = tokens.refreshTokenExpiresAt;
  }
  return ok(res, data, status);
}

function readRefreshToken(req) {
  return (req.body && req.body.refreshToken) || (req.cookies && req.cookies[REFRESH_COOKIE]);
}

const emailSchema = z.string().trim().toLowerCase().email().max(254);

router.post(
  '/register',
  limits.registerLimiter,
  validate({ body: z.object({ email: emailSchema, password: passwordSchema, displayName: displayNameSchema }).strict() }),
  async (req, res) => {
    const settings = await getSettings();
    if (!settings.registrationOpen) throw AppError.forbidden('Registration is closed', 'REGISTRATION_CLOSED');

    const { email, password, displayName } = req.valid.body;
    if (await User.exists({ email })) throw AppError.conflict('Email is already registered', 'EMAIL_TAKEN');

    const user = await User.create({
      email,
      displayName,
      passwordHash: await hashPassword(password),
      role: 'PLAYER',
      rating: settings.defaultRating,
      peakRating: settings.defaultRating,
      lastLoginAt: new Date(),
    });
    await Wallet.create({ userId: user._id, balance: 0 });

    const { tokens } = await tokenService.createSession(user, clientMeta(req));
    return sendSession(req, res, user, tokens, 201);
  },
);

router.post(
  '/login',
  limits.loginLimiter,
  validate({
    body: z.object({
      email: emailSchema,
      password: z.string().min(1).max(128),
      // Admin portal sends "admin" so player accounts cannot sign in there
      portal: z.enum(['admin', 'player']).optional(),
    }),
  }),
  async (req, res) => {
    const { email, password, portal } = req.valid.body;
    const user = await User.findOne({ email }).select('+passwordHash');
    const valid = await verifyPassword(password, user && user.passwordHash);
    if (!user || !valid) throw AppError.unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
    if (user.status !== 'ACTIVE') throw AppError.forbidden('Account is suspended', 'ACCOUNT_SUSPENDED');
    if (portal === 'admin' && !ADMIN_ROLES.includes(user.role)) throw AppError.forbidden();

    user.lastLoginAt = new Date();
    user.lastActiveAt = new Date();
    await user.save();

    if (ADMIN_ROLES.includes(user.role)) {
      req.user = user;
      await audit(req, { action: 'ADMIN_LOGIN', targetType: 'USER', targetId: user._id });
    }

    const { tokens } = await tokenService.createSession(user, clientMeta(req));
    return sendSession(req, res, user, tokens);
  },
);

router.post('/refresh', limits.refreshLimiter, async (req, res) => {
  const { user, tokens } = await tokenService.rotate(readRefreshToken(req), clientMeta(req));
  return sendSession(req, res, user, tokens);
});

router.post('/logout', async (req, res) => {
  await tokenService.revokeByToken(readRefreshToken(req));
  res.clearCookie(REFRESH_COOKIE, cookieOptions());
  return ok(res, { loggedOut: true });
});

router.get('/me', authenticate, (req, res) => ok(res, { user: publicUser(req.user) }));

router.post(
  '/forgot-password',
  limits.passwordResetLimiter,
  validate({ body: z.object({ email: emailSchema }) }),
  async (req, res) => {
    const user = await User.findOne({ email: req.valid.body.email, status: 'ACTIVE' });
    if (user) {
      const token = crypto.randomBytes(32).toString('base64url');
      await PasswordReset.updateMany({ userId: user._id, usedAt: null }, { usedAt: new Date() });
      await PasswordReset.create({
        userId: user._id,
        tokenHash: tokenService.sha256(token),
        expiresAt: new Date(Date.now() + RESET_TOKEN_TTL_MS),
      });
      await sendPasswordReset(user.email, token);
    }
    // Same response whether or not the email exists
    return ok(res, { message: 'If the email is registered, a reset link has been sent' });
  },
);

router.post(
  '/reset-password',
  limits.passwordResetLimiter,
  validate({ body: z.object({ token: z.string().min(20).max(200), password: passwordSchema }) }),
  async (req, res) => {
    const { token, password } = req.valid.body;
    const reset = await PasswordReset.findOneAndUpdate(
      { tokenHash: tokenService.sha256(token), usedAt: null, expiresAt: { $gt: new Date() } },
      { usedAt: new Date() },
    );
    if (!reset) throw AppError.badRequest('Reset link is invalid or has expired', 'INVALID_RESET_TOKEN');

    const user = await User.findById(reset.userId);
    if (!user) throw AppError.badRequest('Reset link is invalid or has expired', 'INVALID_RESET_TOKEN');
    user.passwordHash = await hashPassword(password);
    await user.save();
    await tokenService.revokeAllForUser(user._id, 'PASSWORD_RESET');

    req.user = user;
    await audit(req, { action: 'PASSWORD_RESET', targetType: 'USER', targetId: user._id });
    return ok(res, { message: 'Password updated. Please sign in again.' });
  },
);

module.exports = router;
module.exports.publicUser = publicUser;
