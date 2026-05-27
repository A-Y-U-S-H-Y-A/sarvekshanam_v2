'use strict';

const router = require('express').Router();

router.use('/health',        require('./healthRoutes'));
router.use('/modules',       require('./moduleRoutes'));
router.use('/scans',         require('./scanRoutes'));
router.use('/commands',      require('./commandRoutes'));
router.use('/ai',            require('./aiRoutes'));
router.use('/settings',      require('./settingsRoutes'));
router.use('/runners',       require('./runnerRoutes'));
router.use('/appointments',  require('./appointmentRoutes'));
router.use('/rag',           require('./ragRoutes'));
router.use('/keys',          require('./apiKeyRoutes'));
router.use('/groups',        require('./groupRoutes'));
router.use('/queue',         require('./queueRoutes'));
router.use('/trash',         require('./trashRoutes'));
router.use('/.well-known',   require('./jwksRoutes'));

module.exports = router;
