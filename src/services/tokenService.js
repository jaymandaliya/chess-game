const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const env = require('../config/env');
const Session = require('../models/Session');
const User = require('../models/User');
const AppError = require('../utils/AppError');

function sha256(value) {
  return crypto.createHash('sha256').update(value).digest('hex');
}

function signAccessToken(user) {
  return jwt.sign({ sub: String(user._id), role: user.role }, env.jwt.accessSecret, {
    expiresIn: env.jwt.accessTtlSeconds,
    issuer: env.jwt.issuer,
    algorithm: 'HS256',
  });
}

function verifyAccessToken(token) {
  return jwt.verify(token, env.jwt.accessSecret, { issuer: env.jwt.issuer, algorithms: ['HS256'] });
}

async function createSession(user, meta, familyId = crypto.randomUUID()) {
  const refreshToken = crypto.randomBytes(48).toString('base64url');
  const session = await Session.create({
    userId: user._id,
    tokenHash: sha256(refreshToken),
    familyId,
    expiresAt: new Date(Date.now() + env.jwt.refreshTtlDays * 24 * 60 * 60 * 1000),
    ip: meta.ip,
    userAgent: meta.userAgent,
  });
  return {
    session,
    tokens: {
      accessToken: signAccessToken(user),
      accessTokenExpiresIn: env.jwt.accessTtlSeconds,
      refreshToken,
      refreshTokenExpiresAt: session.expiresAt.toISOString(),
    },
  };
}

async function revokeFamily(familyId, reason) {
  await Session.updateMany({ familyId, revokedAt: null }, { revokedAt: new Date(), revokeReason: reason });
}

async function revokeAllForUser(userId, reason) {
  await Session.updateMany({ userId, revokedAt: null }, { revokedAt: new Date(), revokeReason: reason });
}

async function rotate(refreshToken, meta) {
  const invalid = AppError.unauthorized('Invalid or expired refresh token', 'INVALID_REFRESH_TOKEN');
  if (!refreshToken || typeof refreshToken !== 'string') throw invalid;

  const current = await Session.findOne({ tokenHash: sha256(refreshToken) });
  if (!current) throw invalid;

  if (current.revokedAt) {
    // A rotated token was used again: assume it was stolen and end every session in the family
    if (current.revokeReason === 'ROTATED') await revokeFamily(current.familyId, 'REUSE_DETECTED');
    throw invalid;
  }
  if (current.expiresAt <= new Date()) throw invalid;

  // Atomic claim, so two parallel refreshes cannot both succeed
  const claimed = await Session.findOneAndUpdate(
    { _id: current._id, revokedAt: null },
    { revokedAt: new Date(), revokeReason: 'ROTATED' },
  );
  if (!claimed) {
    await revokeFamily(current.familyId, 'REUSE_DETECTED');
    throw invalid;
  }

  const user = await User.findById(current.userId);
  if (!user || user.status !== 'ACTIVE') {
    await revokeFamily(current.familyId, 'USER_INACTIVE');
    throw AppError.unauthorized('Account is not active', 'ACCOUNT_INACTIVE');
  }

  const { session, tokens } = await createSession(user, meta, current.familyId);
  await Session.updateOne({ _id: current._id }, { replacedBy: session._id });
  return { user, tokens };
}

async function revokeByToken(refreshToken, reason = 'LOGOUT') {
  if (!refreshToken || typeof refreshToken !== 'string') return;
  const session = await Session.findOne({ tokenHash: sha256(refreshToken) });
  if (session) await revokeFamily(session.familyId, reason);
}

module.exports = {
  sha256,
  signAccessToken,
  verifyAccessToken,
  createSession,
  rotate,
  revokeByToken,
  revokeAllForUser,
};
