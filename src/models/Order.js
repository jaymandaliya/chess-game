const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const STATUSES = ['PENDING', 'PAID', 'FAILED', 'REFUNDED'];

const orderSchema = new Schema(
  {
    orderNumber: { type: String, required: true, unique: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // Snapshot at purchase time, so later package edits do not change history
    package: {
      packageId: { type: Schema.Types.ObjectId, ref: 'CoinPackage', required: true },
      name: { type: String, required: true },
      coins: { type: Number, required: true },
      pricePaise: { type: Number, required: true },
      bonusTournamentCoins: { type: Number, default: 0 },
      tag: String,
    },
    coins: { type: Number, required: true },
    tournamentCoins: { type: Number, default: 0 },
    amountPaise: { type: Number, required: true },
    currency: { type: String, required: true, default: 'INR' },
    status: { type: String, enum: STATUSES, default: 'PENDING', index: true },
    provider: { type: String, required: true },
    providerOrderId: { type: String, required: true, unique: true },
    providerPaymentId: { type: String, unique: true, sparse: true },
    paidVia: { type: String, enum: ['verify', 'webhook'] },
    paidAt: Date,
    failedAt: Date,
    failureReason: String,
    refundedAt: Date,
  },
  { timestamps: true },
);

orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paidAt: -1 });
toJsonPlugin(orderSchema);

module.exports = model('Order', orderSchema);
module.exports.STATUSES = STATUSES;
