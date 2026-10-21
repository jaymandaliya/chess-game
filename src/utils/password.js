const bcrypt = require('bcryptjs');
const { z } = require('zod');
const env = require('../config/env');

const ROUNDS = env.isTest ? 4 : 12;

// Compared against when the email does not exist, so response time does not reveal accounts
const DUMMY_HASH = bcrypt.hashSync('timing-safe-dummy-password', ROUNDS);

const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128)
  .regex(/[A-Za-z]/, 'Password must contain a letter')
  .regex(/\d/, 'Password must contain a number');

function hashPassword(password) {
  return bcrypt.hash(password, ROUNDS);
}

async function verifyPassword(password, hash) {
  return bcrypt.compare(password, hash || DUMMY_HASH);
}

module.exports = { passwordSchema, hashPassword, verifyPassword };
