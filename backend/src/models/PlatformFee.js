const { Schema, model } = require('mongoose');
const { toJsonPlugin, immutablePlugin } = require('./plugins');

// Platform's cut (e.g. 15%) taken from game pots and tournament prize pools, in coins
const platformFeeSchema = new Schema(
  {
    source: { type: String, enum: ['GAME', 'TOURNAMENT'], required: true },
    coins: { type: Number, required: true, min: 1 },
    feePercent: { type: Number, required: true },
    grossCoins: { type: Number, required: true },
    refType: { type: String, required: true },
    refId: { type: String, required: true, unique: true },
    userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

platformFeeSchema.index({ createdAt: -1 });
toJsonPlugin(platformFeeSchema);
immutablePlugin(platformFeeSchema, 'PlatformFee');

module.exports = model('PlatformFee', platformFeeSchema);
