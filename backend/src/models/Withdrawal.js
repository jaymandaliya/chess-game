const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const STATUSES = ['PENDING', 'PAID', 'REJECTED'];

// Coins → money request. Coins are debited when requested; a rejection returns them.
// Values are snapshotted so later rate/tax changes do not alter existing requests.
const withdrawalSchema = new Schema(
  {
    requestNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    coins: { type: Number, required: true, min: 1 },
    coinValuePaise: { type: Number, required: true },
    grossPaise: { type: Number, required: true },
    tdsPercent: { type: Number, required: true },
    tdsPaise: { type: Number, required: true },
    netPaise: { type: Number, required: true },
    payoutMethod: { type: String, enum: ['UPI', 'BANK'], required: true },
    payoutTo: { type: String, required: true }, // masked destination
    status: { type: String, enum: STATUSES, default: 'PENDING', index: true },
    payoutReference: String,
    rejectionReason: String,
    reviewedAt: Date,
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

withdrawalSchema.index({ status: 1, createdAt: -1 });
toJsonPlugin(withdrawalSchema);

module.exports = model('Withdrawal', withdrawalSchema);
module.exports.STATUSES = STATUSES;
