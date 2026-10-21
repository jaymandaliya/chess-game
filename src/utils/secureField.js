const crypto = require('crypto');
const env = require('../config/env');

// AES-256-GCM for sensitive KYC fields (PAN, bank account, UPI id).
// Format: v1.<iv>.<tag>.<ciphertext> (base64url parts)
function key() {
  if (env.kycEncryptionKey) return Buffer.from(env.kycEncryptionKey, 'hex');
  // Development/test fallback; config/env.js requires a real key in production
  return crypto.createHash('sha256').update(`kyc:${env.jwt.accessSecret}`).digest();
}

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key(), iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), data.toString('base64url')].join('.');
}

function decrypt(token) {
  const [version, iv, tag, data] = String(token).split('.');
  if (version !== 'v1') throw new Error('Unknown encrypted field format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64url')), decipher.final()]).toString('utf8');
}

function mask(value, visible = 4) {
  const s = String(value);
  return s.length <= visible ? s : `${'•'.repeat(Math.min(s.length - visible, 8))}${s.slice(-visible)}`;
}

module.exports = { encrypt, decrypt, mask };
