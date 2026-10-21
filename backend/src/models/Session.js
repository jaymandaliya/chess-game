const { Schema, model } = require('mongoose');

// One row per refresh token. Rotation revokes the old row and creates a new one in the same family;
// presenting a revoked token revokes the whole family (token theft detection).
const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokeReason: String,
    replacedBy: { type: Schema.Types.ObjectId, ref: 'Session' },
    ip: String,
    userAgent: String,
  },
  { timestamps: true },
);

sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = model('Session', sessionSchema);
