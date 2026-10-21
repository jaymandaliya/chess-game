const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const coinPackageSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    // Lower-cased name, enforces case-insensitive uniqueness
    nameKey: { type: String, required: true, unique: true },
    coins: { type: Number, required: true, min: 1, validate: Number.isInteger },
    pricePaise: { type: Number, required: true, min: 1, validate: Number.isInteger },
    tag: { type: String, trim: true },
    active: { type: Boolean, default: true, index: true },
    sortOrder: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

coinPackageSchema.pre('validate', function setNameKey(next) {
  if (this.name) this.nameKey = this.name.trim().toLowerCase();
  next();
});

toJsonPlugin(coinPackageSchema, { hide: ['nameKey', 'createdBy', 'updatedBy'] });

module.exports = model('CoinPackage', coinPackageSchema);
