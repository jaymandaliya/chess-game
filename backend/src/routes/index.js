const express = require('express');
const { authenticate, requireRole } = require('../middleware/auth');
const maintenanceGuard = require('../middleware/maintenance');

const router = express.Router();

router.use('/auth', require('./auth.routes'));
router.use('/payments', require('./payments.routes'));

router.use('/player', authenticate, requireRole('PLAYER'), maintenanceGuard, require('./player.routes'));

// RBAC for the whole admin area; individual routes narrow further (e.g. SUPER_ADMIN only)
const admin = express.Router();
admin.use(authenticate, requireRole('ADMIN', 'SUPER_ADMIN'));
admin.use('/dashboard', require('./admin/dashboard.routes'));
admin.use('/players', require('./admin/players.routes'));
admin.use('/coin-packages', require('./admin/coinPackages.routes'));
admin.use('/payments', require('./admin/payments.routes'));
admin.use('/game-activity', require('./admin/gameActivity.routes'));
admin.use('/audit-logs', require('./admin/auditLogs.routes'));
admin.use('/settings', require('./admin/settings.routes'));
admin.use('/reports', require('./admin/reports.routes'));
admin.use('/tournaments', require('./admin/tournaments.routes'));
admin.use('/revenue-logs', require('./admin/revenue.routes'));
admin.use(require('./admin/money.routes'));
router.use('/admin', admin);

module.exports = router;
