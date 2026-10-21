const { z } = require('zod');

const displayNameSchema = z
  .string()
  .trim()
  .min(3)
  .max(30)
  .regex(/^[A-Za-z0-9_ .-]+$/, 'Display name may contain letters, numbers, space, _ . -');

const idParam = z.object({ id: z.string() });

module.exports = { displayNameSchema, idParam };
