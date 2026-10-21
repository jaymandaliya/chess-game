const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const COIN_TYPES = ['PLAY', 'TOURNAMENT'];

// Two separate balances: PLAY coins (daily games, redeemable when withdrawals are enabled)
// and TOURNAMENT coins (tournament entry only). Only walletService changes them, inside a
// transaction together with a ledger row.
const walletSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true },
    balance: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
    tournamentBalance: { type: Number, required: true, default: 0, min: 0, validate: Number.isInteger },
  },
  { timestamps: true },
);

toJsonPlugin(walletSchema);

module.exports = model('Wallet', walletSchema);
module.exports.COIN_TYPES = COIN_TYPES;
module.exports.balanceField = (coinType = 'PLAY') => (coinType === 'TOURNAMENT' ? 'tournamentBalance' : 'balance');
