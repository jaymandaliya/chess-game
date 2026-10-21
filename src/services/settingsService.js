const { z } = require('zod');
const Setting = require('../models/Setting');

const KEY = 'platform';

// Only these settings exist and can be changed by admins
const settingsShape = z.object({
  maintenanceMode: z.boolean(),
  registrationOpen: z.boolean(),
  defaultRating: z.number().int().min(100).max(3000),
  supportEmail: z.string().email().max(120),
  minAppVersion: z.string().regex(/^\d+\.\d+\.\d+$/),
});

const DEFAULTS = {
  maintenanceMode: false,
  registrationOpen: true,
  defaultRating: 1200,
  supportEmail: 'support@example.com',
  minAppVersion: '1.0.0',
};

const CACHE_MS = 30 * 1000;
let cache = null;

async function getSettings() {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.values;
  const doc = await Setting.findOne({ key: KEY });
  const values = { ...DEFAULTS, ...(doc ? doc.values : {}) };
  cache = { values, at: Date.now() };
  return values;
}

async function updateSettings(patch, actorId) {
  const before = await getSettings();
  const set = { updatedBy: actorId };
  for (const [k, v] of Object.entries(patch)) set[`values.${k}`] = v;
  await Setting.findOneAndUpdate({ key: KEY }, { $set: set }, { upsert: true });
  cache = null;
  const after = await getSettings();
  return { before, after };
}

function clearCache() {
  cache = null;
}

module.exports = { settingsPatchSchema: settingsShape.partial().strict(), getSettings, updateSettings, clearCache, DEFAULTS };
