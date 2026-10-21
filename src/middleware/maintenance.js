const AppError = require('../utils/AppError');
const { getSettings } = require('../services/settingsService');

// Blocks player endpoints while maintenance mode is on; admins are unaffected
async function maintenanceGuard(req, res, next) {
  const settings = await getSettings();
  if (settings.maintenanceMode) {
    throw new AppError(503, 'MAINTENANCE', 'The platform is under maintenance. Please try again later.');
  }
  next();
}

module.exports = maintenanceGuard;
