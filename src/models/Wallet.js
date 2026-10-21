const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

// Balance is only changed by walletService inside a transaction, together with a ledger row
const walletSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  },
  { timestamps: true },
);

toJsonPlugin(walletSchema);

module.exports = model('Wallet', walletSchema);
