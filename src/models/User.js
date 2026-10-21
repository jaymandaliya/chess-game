const { Schema, model } = require('mongoose');
const { toJsonPlugin } = require('./plugins');

const ROLES = ['PLAYER', 'ADMIN', 'SUPER_ADMIN'];
const STATUSES = ['ACTIVE', 'SUSPENDED'];

const settingsSchema = new Schema(
  {
    boardTheme: { type: String, enum: ['classic', 'green', 'blue', 'wood'], default: 'classic' },
    pieceSet: { type: String, enum: ['standard', 'neo', 'alpha'], default: 'standard' },
    soundEnabled: { type: Boolean, default: true },
    notificationsEnabled: { type: Boolean, default: true },
    autoQueen: { type: Boolean, default: false },
    showLegalMoves: { type: Boolean, default: true },
    language: { type: String, enum: ['en', 'hi'], default: 'en' },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    displayName: { type: String, required: true, trim: true },
    role: { type: String, enum: ROLES, default: 'PLAYER', index: true },
    status: { type: String, enum: STATUSES, default: 'ACTIVE', index: true },
    avatarUrl: String,
    country: String,
    bio: String,
    rating: { type: Number, default: 1200 },
    peakRating: { type: Number, default: 1200 },
    settings: { type: settingsSchema, default: () => ({}) },
    lastLoginAt: Date,
    lastActiveAt: { type: Date, index: true },
    suspendedAt: Date,
    suspendedReason: String,
  },
  { timestamps: true },
);

userSchema.index({ createdAt: -1 });
userSchema.index({ displayName: 1 });
toJsonPlugin(userSchema, { hide: ['passwordHash'] });

module.exports = model('User', userSchema);
module.exports.ROLES = ROLES;
module.exports.STATUSES = STATUSES;
