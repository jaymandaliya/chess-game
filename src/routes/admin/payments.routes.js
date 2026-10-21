const express = require('express');
const { z } = require('zod');
const Order = require('../../models/Order');
const User = require('../../models/User');
const Transaction = require('../../models/Transaction');
const validate = require('../../middleware/validate');
const { ok, findByIdOr404, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

const router = express.Router();

function paymentRow(order) {
  const json = order.toJSON();
  const user = order.userId && order.userId.displayName !== undefined ? order.userId : null;
  return {
    id: json.id,
    orderNumber: json.orderNumber,
    user: user ? { id: String(user._id), displayName: user.displayName, email: user.email } : { id: String(order.userId) },
    package: json.package,
    coins: json.coins,
    amountPaise: json.amountPaise,
    currency: json.currency,
    provider: json.provider,
    providerOrderId: json.providerOrderId,
    providerPaymentId: json.providerPaymentId || null,
    status: json.status,
    paidVia: json.paidVia || null,
    failureReason: json.failureReason || null,
    createdAt: json.createdAt,
    paidAt: json.paidAt || null,
    refundedAt: json.refundedAt || null,
  };
}

// Search matches order number, provider order/payment reference, or user email
async function buildFilter(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.userId) filter.userId = q.userId;
  const range = dateRange(q.from, q.to);
  if (range) filter.createdAt = range;
  if (q.search) {
    const re = new RegExp(escapeRegex(q.search), 'i');
    const users = await User.find({ email: re }).select('_id').limit(200);
    filter.$or = [
      { orderNumber: re },
      { providerOrderId: q.search },
      { providerPaymentId: q.search },
      { userId: { $in: users.map((u) => u._id) } },
    ];
  }
  return filter;
}

const paymentsQuery = listQuery(['createdAt', 'paidAt', 'amountPaise'], {
  status: z.enum(Order.STATUSES).optional(),
  userId: z.string().regex(/^[a-f\d]{24}$/i).optional(),
});

router.get('/', validate({ query: paymentsQuery }), async (req, res) => {
  const q = req.valid.query;
  const page = await paginate(Order, await buildFilter(q), q, { populate: { path: 'userId', select: 'displayName email' } });
  return ok(res, { ...page, items: page.items.map(paymentRow) });
});

router.get('/:id', validate({ params: idParam }), async (req, res) => {
  const order = await findByIdOr404(
    (id) => Order.findById(id).populate('userId', 'displayName email'),
    req.valid.params.id,
    'Payment order not found',
  );
  const ledger = await Transaction.find({ refType: 'ORDER', refId: String(order._id) }).sort({ createdAt: 1 });
  return ok(res, { ...paymentRow(order), ledger });
});

module.exports = router;
module.exports.buildFilter = buildFilter;
module.exports.paymentRow = paymentRow;
module.exports.paymentsQuery = paymentsQuery;
