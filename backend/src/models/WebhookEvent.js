const { Schema, model } = require('mongoose');

// Remembers processed provider events so webhook retries are handled once
const webhookEventSchema = new Schema(
  {
    eventId: { type: String, required: true, unique: true },
    provider: { type: String, required: true },
    event: String,
    processedAt: Date,
  },
  { timestamps: true },
);

webhookEventSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });

module.exports = model('WebhookEvent', webhookEventSchema);
