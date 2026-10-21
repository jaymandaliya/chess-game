const crypto = require('crypto');
const CoinPackage = require('../models/CoinPackage');
const Order = require('../models/Order');
const Wallet = require('../models/Wallet');
const walletService = require('./walletService');
const { getProvider } = require('./paymentProvider');
const { audit } = require('./auditService');
const AppError = require('../utils/AppError');
const { isObjectId } = require('../utils/http');
const { withTransaction } = require('../utils/transaction');
const logger = require('../utils/logger');

function newOrderNumber() {
  const day = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  return `CO-${day}-${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

function checkoutPayload(order) {
  const provider = getProvider();
  return {
    order,
    checkout: {
      provider: provider.name,
      keyId: provider.keyId,
      providerOrderId: order.providerOrderId,
      amountPaise: order.amountPaise,
      currency: order.currency,
    },
  };
}

// Price and coins always come from the stored package, never from the client
async function createOrder(user, packageId) {
  if (!isObjectId(packageId)) throw AppError.notFound('Coin package not found', 'PACKAGE_NOT_FOUND');
  const pkg = await CoinPackage.findOne({ _id: packageId, active: true });
  if (!pkg) throw AppError.notFound('Coin package not found', 'PACKAGE_NOT_FOUND');

  const orderNumber = newOrderNumber();
  const providerOrder = await getProvider().createOrder({
    amountPaise: pkg.pricePaise,
    currency: 'INR',
    receipt: orderNumber,
    notes: { userId: String(user._id), packageId: String(pkg._id) },
  });

  const order = await Order.create({
    orderNumber,
    userId: user._id,
    package: { packageId: pkg._id, name: pkg.name, coins: pkg.coins, pricePaise: pkg.pricePaise, tag: pkg.tag },
    coins: pkg.coins,
    amountPaise: pkg.pricePaise,
    currency: 'INR',
    status: 'PENDING',
    provider: getProvider().name,
    providerOrderId: providerOrder.id,
  });
  return checkoutPayload(order);
}

// Idempotent: marks the order PAID and credits coins exactly once
async function markPaid({ providerOrderId, providerPaymentId, amountPaise, currency, via }, req) {
  return withTransaction(async (session) => {
    const order = await Order.findOne({ providerOrderId }).session(session);
    if (!order) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
    if (order.status === 'PAID') return { order, alreadyProcessed: true };
    if (order.status === 'REFUNDED') throw AppError.conflict('Order was refunded', 'ORDER_REFUNDED');

    if (amountPaise !== order.amountPaise || currency !== order.currency) {
      logger.error({ orderId: order._id, amountPaise, currency }, 'Paid amount does not match order');
      throw AppError.unprocessable('Paid amount does not match the order', 'AMOUNT_MISMATCH');
    }

    // Status guard + transaction write conflict make concurrent verify/webhook calls safe
    const paid = await Order.findOneAndUpdate(
      { _id: order._id, status: { $in: ['PENDING', 'FAILED'] } },
      { $set: { status: 'PAID', providerPaymentId, paidAt: new Date(), paidVia: via }, $unset: { failureReason: 1 } },
      { new: true, session },
    );
    if (!paid) return { order, alreadyProcessed: true };

    await walletService.credit(
      {
        userId: order.userId,
        amount: order.coins,
        type: 'PURCHASE',
        refType: 'ORDER',
        refId: String(order._id),
        idempotencyKey: `order:${order._id}`,
        description: `Purchased ${order.package.name} (${order.coins} coins)`,
      },
      session,
    );
    await audit(req, {
      action: 'PAYMENT_CAPTURED',
      targetType: 'ORDER',
      targetId: order._id,
      metadata: { orderNumber: order.orderNumber, amountPaise, coins: order.coins, via },
    }, session);
    return { order: paid, alreadyProcessed: false };
  });
}

async function markFailed({ providerOrderId, reason }) {
  return Order.findOneAndUpdate(
    { providerOrderId, status: 'PENDING' },
    { status: 'FAILED', failedAt: new Date(), failureReason: (reason || 'Payment failed').slice(0, 200) },
    { new: true },
  );
}

// Marks a PAID order refunded and takes back the coins that are still in the wallet
async function markRefunded({ providerPaymentId }, req) {
  return withTransaction(async (session) => {
    const order = await Order.findOneAndUpdate(
      { providerPaymentId, status: 'PAID' },
      { status: 'REFUNDED', refundedAt: new Date() },
      { new: true, session },
    );
    if (!order) return null;

    const wallet = await Wallet.findOne({ userId: order.userId }).session(session);
    const reversible = Math.min(order.coins, wallet ? wallet.balance : 0);
    if (reversible > 0) {
      await walletService.debit(
        {
          userId: order.userId,
          amount: reversible,
          type: 'REVERSAL',
          refType: 'ORDER',
          refId: String(order._id),
          idempotencyKey: `refund:${order._id}`,
          description: `Refund of ${order.orderNumber}`,
        },
        session,
      );
    }
    await audit(req, {
      action: 'PAYMENT_REFUNDED',
      targetType: 'ORDER',
      targetId: order._id,
      metadata: { orderNumber: order.orderNumber, coinsReversed: reversible, shortfall: order.coins - reversible },
    }, session);
    return order;
  });
}

// Client-side confirmation after checkout. Signature + provider lookup are verified server-side.
async function verifyCheckout(user, { providerOrderId, providerPaymentId, signature }, req) {
  const order = await Order.findOne({ providerOrderId, userId: user._id });
  if (!order) throw AppError.notFound('Order not found', 'ORDER_NOT_FOUND');
  if (order.status === 'PAID') return { order, alreadyProcessed: true };

  const provider = getProvider();
  if (!provider.verifyCheckoutSignature({ providerOrderId, providerPaymentId, signature })) {
    await audit(req, {
      action: 'PAYMENT_VERIFY_FAILED',
      targetType: 'ORDER',
      targetId: order._id,
      outcome: 'FAILURE',
      metadata: { reason: 'INVALID_SIGNATURE' },
    });
    throw AppError.badRequest('Payment signature is invalid', 'INVALID_SIGNATURE');
  }

  let amountPaise = order.amountPaise;
  let currency = order.currency;
  const payment = await provider.fetchPayment(providerPaymentId);
  if (payment) {
    if (payment.orderId !== providerOrderId) {
      throw AppError.unprocessable('Payment does not belong to this order', 'PAYMENT_ORDER_MISMATCH');
    }
    if (payment.status === 'failed') {
      const failed = await markFailed({ providerOrderId, reason: 'Payment failed at provider' });
      return { order: failed || order, alreadyProcessed: false };
    }
    if (payment.status !== 'captured') {
      // Authorized but not captured yet: the payment.captured webhook will complete it
      return { order, alreadyProcessed: false };
    }
    amountPaise = payment.amountPaise;
    currency = payment.currency;
  }

  return markPaid({ providerOrderId, providerPaymentId, amountPaise, currency, via: 'verify' }, req);
}

module.exports = { createOrder, markPaid, markFailed, markRefunded, verifyCheckout };
