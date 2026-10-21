const { Schema, model } = require('mongoose');
const { toJsonPlugin, immutablePlugin } = require('./plugins');

const TYPES = ['PURCHASE', 'ENTRY_FEE', 'WINNINGS', 'REFUND', 'REVERSAL', 'ADJUSTMENT'];

// Immutable coin ledger: amount is signed (credit > 0, debit < 0)
const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: TYPES, required: true },
    amount: { type: Number, required: true, validate: (v) => Number.isInteger(v) && v !== 0 },
    balanceAfter: { type: Number, required: true },
    refType: String,
    refId: String,
    idempotencyKey: { type: String, unique: true, sparse: true },
    description: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

transactionSchema.index({ userId: 1, createdAt: -1 });
toJsonPlugin(transactionSchema, { hide: ['idempotencyKey'] });
immutablePlugin(transactionSchema, 'Transaction');

module.exports = model('Transaction', transactionSchema);
module.exports.TYPES = TYPES;
