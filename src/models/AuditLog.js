const { Schema, model } = require('mongoose');
const { toJsonPlugin, immutablePlugin } = require('./plugins');

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', index: true },
    actorEmail: String,
    actorRole: String,
    action: { type: String, required: true, index: true },
    targetType: { type: String, index: true },
    targetId: String,
    outcome: { type: String, enum: ['SUCCESS', 'FAILURE'], default: 'SUCCESS' },
    metadata: Schema.Types.Mixed,
    ip: String,
    userAgent: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

auditLogSchema.index({ createdAt: -1 });
toJsonPlugin(auditLogSchema);
immutablePlugin(auditLogSchema, 'AuditLog');

module.exports = model('AuditLog', auditLogSchema);
