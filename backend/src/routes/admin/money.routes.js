const express = require('express');
const { z } = require('zod');
const KycProfile = require('../../models/KycProfile');
const Withdrawal = require('../../models/Withdrawal');
const User = require('../../models/User');
const kycService = require('../../services/kycService');
const withdrawalService = require('../../services/withdrawalService');
const { audit } = require('../../services/auditService');
const validate = require('../../middleware/validate');
const AppError = require('../../utils/AppError');
const { ok, findByIdOr404, isObjectId, escapeRegex } = require('../../utils/http');
const { listQuery, dateRange, paginate } = require('../../utils/pagination');
const { idParam } = require('../schemas');

const router = express.Router();

async function userFilter(search) {
  if (!search) return null;
  const re = new RegExp(escapeRegex(search), 'i');
  const users = await User.find({ $or: [{ email: re }, { displayName: re }] }).select('_id').limit(200);
  return users.map((u) => u._id);
}

// ---------- KYC ----------

router.get(
  '/kyc',
  validate({ query: listQuery(['submittedAt', 'reviewedAt'], { status: z.enum(KycProfile.STATUSES).optional() }) }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = {};
    if (q.status) filter.status = q.status;
    const ids = await userFilter(q.search);
    if (ids) filter.userId = { $in: ids };
    const page = await paginate(KycProfile, filter, q, { populate: { path: 'userId', select: 'displayName email' } });
    return ok(res, {
      ...page,
      items: page.items.map((k) => ({
        ...kycService.publicView(k),
        id: String(k._id),
        user: k.userId ? { id: String(k.userId._id), displayName: k.userId.displayName, email: k.userId.email } : null,
      })),
    });
  },
);

router.get('/kyc/:userId', validate({ params: z.object({ userId: z.string() }) }), async (req, res) => {
  const { userId } = req.valid.params;
  if (!isObjectId(userId)) throw AppError.notFound('KYC not found', 'KYC_NOT_FOUND');
  const kyc = await KycProfile.findOne({ userId });
  if (!kyc) throw AppError.notFound('KYC not found', 'KYC_NOT_FOUND');
  // Viewing unmasked identity data is itself an audited action
  await audit(req, { action: 'KYC_VIEWED', targetType: 'USER', targetId: userId });
  return ok(res, kycService.adminView(kyc));
});

router.patch(
  '/kyc/:userId',
  validate({
    params: z.object({ userId: z.string() }),
    body: z
      .object({ status: z.enum(['APPROVED', 'REJECTED']), reason: z.string().trim().max(300).optional() })
      .strict()
      .refine((b) => b.status === 'APPROVED' || (b.reason && b.reason.length >= 3), { message: 'Give a reason for rejection', path: ['reason'] }),
  }),
  async (req, res) => {
    const { userId } = req.valid.params;
    if (!isObjectId(userId)) throw AppError.notFound('KYC not found', 'KYC_NOT_FOUND');
    const kyc = await kycService.review(req, userId, req.valid.body);
    return ok(res, kycService.publicView(kyc));
  },
);

// ---------- Withdrawals ----------

router.get(
  '/withdrawals',
  validate({ query: listQuery(['createdAt', 'netPaise'], { status: z.enum(Withdrawal.STATUSES).optional() }) }),
  async (req, res) => {
    const q = req.valid.query;
    const filter = {};
    if (q.status) filter.status = q.status;
    const range = dateRange(q.from, q.to);
    if (range) filter.createdAt = range;
    if (q.search) {
      const ids = await userFilter(q.search);
      filter.$or = [{ requestNumber: new RegExp(escapeRegex(q.search), 'i') }, { userId: { $in: ids } }];
    }
    return ok(res, await paginate(Withdrawal, filter, q, { populate: { path: 'userId', select: 'displayName email' } }));
  },
);

router.get('/withdrawals/:id', validate({ params: idParam }), async (req, res) =>
  ok(res, await findByIdOr404((id) => Withdrawal.findById(id).populate('userId', 'displayName email'), req.valid.params.id, 'Withdrawal not found')),
);

router.patch(
  '/withdrawals/:id',
  validate({
    params: idParam,
    body: z
      .object({
        action: z.enum(['PAY', 'REJECT']),
        payoutReference: z.string().trim().max(100).optional(),
        reason: z.string().trim().max(300).optional(),
      })
      .strict()
      .refine((b) => b.action !== 'PAY' || (b.payoutReference && b.payoutReference.length >= 3), {
        message: 'Enter the bank / UPI transaction reference',
        path: ['payoutReference'],
      })
      .refine((b) => b.action !== 'REJECT' || (b.reason && b.reason.length >= 3), { message: 'Give a reason for rejection', path: ['reason'] }),
  }),
  async (req, res) => {
    if (!isObjectId(req.valid.params.id)) throw AppError.notFound('Withdrawal not found', 'WITHDRAWAL_NOT_FOUND');
    return ok(res, await withdrawalService.review(req, req.valid.params.id, req.valid.body));
  },
);

module.exports = router;
