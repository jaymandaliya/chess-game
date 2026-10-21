const express = require('express');
const { z } = require('zod');
const WebhookEvent = require('../models/WebhookEvent');
const orderService = require('../services/orderService');
const { getProvider } = require('../services/paymentProvider');
const { sha256 } = require('../services/tokenService');
const { authenticate, requireRole } = require('../middleware/auth');
const validate = require('../middleware/validate');
const limits = require('../middleware/rateLimits');
const AppError = require('../utils/AppError');
const { ok } = require('../utils/http');
const logger = require('../utils/logger');

const router = express.Router();

router.post(
  '/verify',
  limits.paymentLimiter,
  authenticate,
  requireRole('PLAYER'),
  validate({
    body: z.object({
      providerOrderId: z.string().min(1).max(100),
      providerPaymentId: z.string().min(1).max(100),
      signature: z.string().min(1).max(200),
    }),
  }),
  async (req, res) => {
    const { order, alreadyProcessed } = await orderService.verifyCheckout(req.user, req.valid.body, req);
    return ok(res, { order, alreadyProcessed });
  },
);

// Development only: completes a checkout without Razorpay. Exists only with PAYMENT_PROVIDER=mock,
// which config/env.js refuses in production. It still goes through the normal signature + verify path.
if (getProvider().name === 'mock') {
  router.post(
    '/mock/complete',
    authenticate,
    requireRole('PLAYER'),
    validate({ body: z.object({ providerOrderId: z.string().min(1).max(100) }) }),
    async (req, res) => {
      const provider = getProvider();
      const { providerOrderId } = req.valid.body;
      const providerPaymentId = `pay_mock_${Date.now().toString(36)}`;
      const signature = provider.signCheckout(providerOrderId, providerPaymentId);
      const result = await orderService.verifyCheckout(req.user, { providerOrderId, providerPaymentId, signature }, req);
      return ok(res, result);
    },
  );
}

async function handleEvent(body) {
  const payment = body && body.payload && body.payload.payment && body.payload.payment.entity;
  switch (body && body.event) {
    case 'payment.captured':
    case 'order.paid':
      if (!payment) return 'ignored';
      await orderService.markPaid({
        providerOrderId: payment.order_id,
        providerPaymentId: payment.id,
        amountPaise: payment.amount,
        currency: payment.currency,
        via: 'webhook',
      });
      return 'paid';
    case 'payment.failed':
      if (!payment) return 'ignored';
      await orderService.markFailed({ providerOrderId: payment.order_id, reason: payment.error_description });
      return 'failed';
    case 'refund.processed': {
      const refund = body.payload.refund && body.payload.refund.entity;
      // Full refunds only; partial refunds need a manual decision
      if (!refund || !payment || refund.amount !== payment.amount) return 'ignored';
      await orderService.markRefunded({ providerPaymentId: refund.payment_id });
      return 'refunded';
    }
    default:
      return 'ignored';
  }
}

// Signed by the provider; no user auth. Raw body is captured in app.js for signature checks.
router.post('/webhook', async (req, res) => {
  const provider = getProvider();
  if (!provider.verifyWebhookSignature(req.rawBody, req.get('x-razorpay-signature'))) {
    throw AppError.badRequest('Invalid webhook signature', 'INVALID_SIGNATURE');
  }

  const eventId = req.get('x-razorpay-event-id') || sha256(req.rawBody);
  try {
    await WebhookEvent.create({ eventId, provider: provider.name, event: req.body.event });
  } catch (err) {
    if (err.code === 11000) return ok(res, { received: true, duplicate: true });
    throw err;
  }

  try {
    const outcome = await handleEvent(req.body);
    await WebhookEvent.updateOne({ eventId }, { processedAt: new Date() });
    return ok(res, { received: true, outcome });
  } catch (err) {
    if (err instanceof AppError && err.status < 500) {
      // Permanent problem (unknown order, amount mismatch): acknowledge so the provider stops retrying
      logger.warn({ eventId, code: err.code }, 'Webhook event not applied');
      return ok(res, { received: true, outcome: 'rejected' });
    }
    // Temporary failure: forget the event so the provider's retry is processed
    await WebhookEvent.deleteOne({ eventId });
    throw err;
  }
});

module.exports = router;
