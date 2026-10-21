const express = require('express');
const { getSettings, updateSettings, settingsPatchSchema } = require('../../services/settingsService');
const { audit } = require('../../services/auditService');
const { requireRole } = require('../../middleware/auth');
const validate = require('../../middleware/validate');
const { ok } = require('../../utils/http');

const router = express.Router();

router.get('/', async (req, res) => ok(res, await getSettings()));

router.patch(
  '/',
  requireRole('SUPER_ADMIN'),
  validate({ body: settingsPatchSchema.refine((b) => Object.keys(b).length > 0, 'Provide at least one setting') }),
  async (req, res) => {
    const { before, after } = await updateSettings(req.valid.body, req.user._id);
    const changes = {};
    for (const key of Object.keys(req.valid.body)) {
      if (before[key] !== after[key]) changes[key] = { from: before[key], to: after[key] };
    }
    await audit(req, { action: 'SETTINGS_UPDATED', targetType: 'SETTINGS', targetId: 'platform', metadata: { changes } });
    return ok(res, after);
  },
);

module.exports = router;
