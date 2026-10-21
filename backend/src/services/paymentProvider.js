const crypto = require('crypto');
const env = require('../config/env');
const AppError = require('../utils/AppError');
const logger = require('../utils/logger');

function hmacHex(secret, data) {
  return crypto.createHmac('sha256', secret).update(data).digest('hex');
}

function safeEqual(expected, actual) {
  if (typeof actual !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(actual);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Both providers use Razorpay's signature scheme and webhook payload shape
function signatureHelpers(keySecret, webhookSecret) {
  return {
    verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature }) {
      return safeEqual(hmacHex(keySecret, `${providerOrderId}|${providerPaymentId}`), signature);
    },
    verifyWebhookSignature(rawBody, signature) {
      if (!webhookSecret || !rawBody) return false;
      return safeEqual(hmacHex(webhookSecret, rawBody), signature);
    },
    signCheckout(providerOrderId, providerPaymentId) {
      return hmacHex(keySecret, `${providerOrderId}|${providerPaymentId}`);
    },
    signWebhook(rawBody) {
      return hmacHex(webhookSecret, rawBody);
    },
  };
}

function razorpayProvider({ razorpayKeyId: keyId, razorpayKeySecret: keySecret, razorpayWebhookSecret }) {
  if (!keyId || !keySecret) throw new Error('RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET are required');
  const auth = `Basic ${Buffer.from(`${keyId}:${keySecret}`).toString('base64')}`;

  async function call(method, path, body) {
    let res;
    try {
      res = await fetch(`https://api.razorpay.com/v1${path}`, {
        method,
        headers: { Authorization: auth, 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(10000),
      });
    } catch (err) {
      logger.error({ err, path }, 'Razorpay request failed');
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider is unavailable');
    }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      logger.error({ status: res.status, error: json.error, path }, 'Razorpay API error');
      throw new AppError(502, 'PAYMENT_PROVIDER_ERROR', 'Payment provider error');
    }
    return json;
  }

  return {
    name: 'razorpay',
    keyId,
    ...signatureHelpers(keySecret, razorpayWebhookSecret),
    async createOrder({ amountPaise, currency, receipt, notes }) {
      const order = await call('POST', '/orders', { amount: amountPaise, currency, receipt, notes });
      return { id: order.id };
    },
    async fetchPayment(paymentId) {
      const p = await call('GET', `/payments/${encodeURIComponent(paymentId)}`);
      return { id: p.id, orderId: p.order_id, amountPaise: p.amount, currency: p.currency, status: p.status };
    },
  };
}

// Local development and tests only (refused in production by config/env.js)
function mockProvider() {
  const keySecret = 'mock_key_secret';
  const webhookSecret = 'mock_webhook_secret';
  return {
    name: 'mock',
    keyId: 'rzp_test_mock',
    ...signatureHelpers(keySecret, webhookSecret),
    async createOrder() {
      return { id: `order_mock_${crypto.randomBytes(8).toString('hex')}` };
    },
    // No remote lookup: the order's own stored amount is used
    async fetchPayment() {
      return null;
    },
  };
}

let instance;
function getProvider() {
  if (!instance) {
    instance = env.payment.provider === 'mock' ? mockProvider() : razorpayProvider(env.payment);
  }
  return instance;
}

module.exports = { getProvider };
