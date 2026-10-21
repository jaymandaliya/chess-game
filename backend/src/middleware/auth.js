const User = require('../models/User');
const AppError = require('../utils/AppError');
const { verifyAccessToken } = require('../services/tokenService');

const ACTIVITY_WRITE_INTERVAL_MS = 5 * 60 * 1000;

async function authenticate(req, res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw AppError.unauthorized('Authentication required');

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err.name === 'TokenExpiredError') throw AppError.unauthorized('Access token expired', 'TOKEN_EXPIRED');
    throw AppError.unauthorized('Invalid access token');
  }

  // Loaded on every request so suspensions and role changes apply immediately
  const user = await User.findById(payload.sub);
  if (!user) throw AppError.unauthorized('Invalid access token');
  if (user.status !== 'ACTIVE') throw AppError.forbidden('Account is suspended', 'ACCOUNT_SUSPENDED');

  if (!user.lastActiveAt || Date.now() - user.lastActiveAt.getTime() > ACTIVITY_WRITE_INTERVAL_MS) {
    User.updateOne({ _id: user._id }, { lastActiveAt: new Date() }).catch(() => {});
  }

  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) throw AppError.unauthorized('Authentication required');
    if (!roles.includes(req.user.role)) throw AppError.forbidden();
    next();
  };
}

module.exports = { authenticate, requireRole };
