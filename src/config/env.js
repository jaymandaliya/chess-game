require('dotenv').config();

const nodeEnv = process.env.NODE_ENV || 'development';
const isProd = nodeEnv === 'production';

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env variable ${name}`);
  return value;
}

const accessSecret = required('JWT_ACCESS_SECRET');
if (isProd && accessSecret.length < 32) {
  throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
}

const paymentProvider = process.env.PAYMENT_PROVIDER || 'razorpay';
if (isProd && paymentProvider === 'mock') {
  throw new Error('PAYMENT_PROVIDER=mock is not allowed in production');
}

module.exports = {
  nodeEnv,
  isProd,
  isTest: nodeEnv === 'test',
  port: Number(process.env.PORT || 4000),
  mongoUri: required('MONGO_URI'),
  trustProxy: Number(process.env.TRUST_PROXY || 0),
  corsOrigins: (process.env.CORS_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean),
  appUrl: process.env.APP_URL || 'http://localhost:3000',
  jwt: {
    accessSecret,
    issuer: 'chess-platform',
    accessTtlSeconds: Number(process.env.ACCESS_TOKEN_TTL_SECONDS || 900),
    refreshTtlDays: Number(process.env.REFRESH_TOKEN_TTL_DAYS || 30),
  },
  payment: {
    provider: paymentProvider,
    razorpayKeyId: process.env.RAZORPAY_KEY_ID || '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
  },
  // INR platform: "today" and daily report buckets use IST
  timezone: 'Asia/Kolkata',
};
