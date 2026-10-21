const { Schema, model } = require('mongoose');
const { toJsonPlugin, immutablePlugin } = require('./plugins');

const TYPES = [
  'PURCHASE', // play coins bought with a package
  'BONUS', // tournament coins included with a package
  'STAKE', // coins put in for an online game
  'STAKE_REFUND', // stake returned (draw / aborted game)
  'WINNINGS', // pot won in an online game, after platform fee
  'TOURNAMENT_ENTRY',
  'TOURNAMENT_REFUND',
  'TOURNAMENT_PRIZE',
  'WITHDRAWAL', // coins converted to money (held while pending)
  'WITHDRAWAL_REVERSAL', // rejected withdrawal, coins returned
  'ENTRY_FEE',
  'REFUND',
  'REVERSAL', // payment refunded at the provider, coins taken back
  'ADJUSTMENT',
];

// Immutable coin ledger: amount is signed (credit > 0, debit < 0), per coin type
const transactionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    coinType: { type: String, enum: ['PLAY', 'TOURNAMENT'], default: 'PLAY', required: true },
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
transactionSchema.index({ userId: 1, coinType: 1, createdAt: -1 });
toJsonPlugin(transactionSchema, { hide: ['idempotencyKey'] });
immutablePlugin(transactionSchema, 'Transaction');

module.exports = model('Transaction', transactionSchema);
module.exports.TYPES = TYPES;
