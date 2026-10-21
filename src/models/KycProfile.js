const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const STATUSES = ['PENDING', 'APPROVED', 'REJECTED'];

// Identity + payout details for withdrawals. PAN and account numbers are stored encrypted
// (AES-256-GCM, utils/secureField); only masked values are returned by default.
const kycSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    fullName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    panEncrypted: { type: String, required: true },
    panMasked: { type: String, required: true },
    payoutMethod: { type: String, enum: ['UPI', 'BANK'], required: true },
    upiEncrypted: String,
    upiMasked: String,
    bankAccountEncrypted: String,
    bankAccountMasked: String,
    ifsc: String,
    accountHolderName: String,
    status: { type: String, enum: STATUSES, default: 'PENDING', index: true },
    rejectionReason: String,
    submittedAt: { type: Date, required: true },
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

toJsonPlugin(kycSchema, { hide: ['panEncrypted', 'upiEncrypted', 'bankAccountEncrypted'] });

module.exports = model('KycProfile', kycSchema);
module.exports.STATUSES = STATUSES;
