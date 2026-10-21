const { z } = require('zod');
const KycProfile = require('../models/KycProfile');
const AppError = require('../utils/AppError');
const { encrypt, decrypt, mask } = require('../utils/secureField');
const { audit } = require('./auditService');

const MIN_AGE_YEARS = 18;

const submitSchema = z
  .object({
    fullName: z.string().trim().min(3).max(100),
    dateOfBirth: z.coerce.date(),
    pan: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{5}[0-9]{4}[A-Z]$/, 'PAN must look like ABCDE1234F'),
    payoutMethod: z.enum(['UPI', 'BANK']),
    upiId: z.string().trim().regex(/^[a-zA-Z0-9._-]{2,256}@[a-zA-Z]{2,64}$/, 'Enter a valid UPI ID (name@bank)').optional(),
    bankAccount: z.string().trim().regex(/^\d{9,18}$/, 'Account number must be 9–18 digits').optional(),
    ifsc: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'IFSC must look like SBIN0001234')
      .optional(),
    accountHolderName: z.string().trim().min(3).max(100).optional(),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.payoutMethod === 'UPI' && !v.upiId) ctx.addIssue({ code: 'custom', path: ['upiId'], message: 'UPI ID is required' });
    if (v.payoutMethod === 'BANK') {
      for (const key of ['bankAccount', 'ifsc', 'accountHolderName']) {
        if (!v[key]) ctx.addIssue({ code: 'custom', path: [key], message: 'Required for bank payouts' });
      }
    }
    const adult = new Date(v.dateOfBirth);
    adult.setFullYear(adult.getFullYear() + MIN_AGE_YEARS);
    if (adult > new Date()) ctx.addIssue({ code: 'custom', path: ['dateOfBirth'], message: `You must be at least ${MIN_AGE_YEARS}` });
  });

function publicView(kyc) {
  if (!kyc) return { status: 'NOT_SUBMITTED' };
  return {
    status: kyc.status,
    fullName: kyc.fullName,
    dateOfBirth: kyc.dateOfBirth,
    pan: kyc.panMasked,
    payoutMethod: kyc.payoutMethod,
    payoutTo: kyc.payoutMethod === 'UPI' ? kyc.upiMasked : `${kyc.bankAccountMasked} · ${kyc.ifsc}`,
    rejectionReason: kyc.rejectionReason || null,
    submittedAt: kyc.submittedAt,
    reviewedAt: kyc.reviewedAt || null,
  };
}

// Full details for staff; reading them is audited
function adminView(kyc) {
  return {
    ...publicView(kyc),
    id: String(kyc._id),
    userId: String(kyc.userId),
    pan: decrypt(kyc.panEncrypted),
    upiId: kyc.upiEncrypted ? decrypt(kyc.upiEncrypted) : null,
    bankAccount: kyc.bankAccountEncrypted ? decrypt(kyc.bankAccountEncrypted) : null,
    ifsc: kyc.ifsc || null,
    accountHolderName: kyc.accountHolderName || null,
  };
}

async function getForUser(userId) {
  return publicView(await KycProfile.findOne({ userId }));
}

async function submit(user, data) {
  const existing = await KycProfile.findOne({ userId: user._id });
  if (existing && existing.status === 'APPROVED') throw AppError.conflict('Your KYC is already approved', 'KYC_APPROVED');
  if (existing && existing.status === 'PENDING') throw AppError.conflict('Your KYC is already under review', 'KYC_PENDING');

  const fields = {
    userId: user._id,
    fullName: data.fullName,
    dateOfBirth: data.dateOfBirth,
    panEncrypted: encrypt(data.pan),
    panMasked: `${data.pan.slice(0, 2)}•••••${data.pan.slice(-3)}`,
    payoutMethod: data.payoutMethod,
    status: 'PENDING',
    submittedAt: new Date(),
    rejectionReason: null,
    reviewedAt: null,
    reviewedBy: null,
  };
  if (data.payoutMethod === 'UPI') {
    Object.assign(fields, { upiEncrypted: encrypt(data.upiId), upiMasked: maskUpi(data.upiId), bankAccountEncrypted: null, bankAccountMasked: null, ifsc: null, accountHolderName: null });
  } else {
    Object.assign(fields, {
      bankAccountEncrypted: encrypt(data.bankAccount),
      bankAccountMasked: mask(data.bankAccount),
      ifsc: data.ifsc,
      accountHolderName: data.accountHolderName,
      upiEncrypted: null,
      upiMasked: null,
    });
  }
  const kyc = await KycProfile.findOneAndUpdate({ userId: user._id }, { $set: fields }, { upsert: true, new: true });
  return publicView(kyc);
}

function maskUpi(upi) {
  const [name, bank] = upi.split('@');
  return `${name.slice(0, 2)}•••@${bank}`;
}

async function review(req, userId, { status, reason }) {
  const kyc = await KycProfile.findOne({ userId });
  if (!kyc) throw AppError.notFound('No KYC submitted for this user', 'KYC_NOT_FOUND');
  if (kyc.status !== 'PENDING') throw AppError.conflict('Only pending KYC can be reviewed', 'KYC_NOT_PENDING');
  kyc.status = status;
  kyc.rejectionReason = status === 'REJECTED' ? reason : null;
  kyc.reviewedAt = new Date();
  kyc.reviewedBy = req.user._id;
  await kyc.save();
  await audit(req, { action: status === 'APPROVED' ? 'KYC_APPROVED' : 'KYC_REJECTED', targetType: 'USER', targetId: userId, metadata: { reason } });
  return kyc;
}

module.exports = { submitSchema, publicView, adminView, getForUser, submit, review };
