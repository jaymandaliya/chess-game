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
  // Coin economy
  winningsFeePercent: z.number().int().min(0).max(50), // platform cut of game pots / tournament pools
  stakeOptions: z.array(z.number().int().min(0).max(100000)).min(1).max(8), // coin entry choices for online games
  // Money out — off until legally cleared
  withdrawalsEnabled: z.boolean(),
  coinValuePaise: z.number().int().min(1).max(10000), // what 1 play coin is worth when withdrawn
  minWithdrawalCoins: z.number().int().min(1).max(10_000_000),
  withdrawalTdsPercent: z.number().int().min(0).max(50),
});

const DEFAULTS = {
  maintenanceMode: false,
  registrationOpen: true,
  defaultRating: 1200,
  supportEmail: 'support@example.com',
  minAppVersion: '1.0.0',
  winningsFeePercent: 15,
  stakeOptions: [0, 10, 50, 100],
  withdrawalsEnabled: false,
  coinValuePaise: 80,
  minWithdrawalCoins: 500,
  withdrawalTdsPercent: 30,
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

// Fee in whole coins, rounded down so the player is never charged more than the stated percent
function feeFor(grossCoins, percent) {
  return Math.floor((grossCoins * percent) / 100);
}

module.exports = {
  settingsPatchSchema: settingsShape.partial().strict(),
  getSettings,
  updateSettings,
  clearCache,
  feeFor,
  DEFAULTS,
};
