const { Schema, model } = require('mongoose');

const settingSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    values: { type: Schema.Types.Mixed, default: {} },
    updatedBy: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true, minimize: false },
);

module.exports = model('Setting', settingSchema);
