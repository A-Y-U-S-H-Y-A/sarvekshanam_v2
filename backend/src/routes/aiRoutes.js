'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const ctrl         = require('../controllers/aiController');

router.post('/chat',      authenticate, ctrl.chat);
router.get('/providers',  authenticate, ctrl.listProviders);

// Package management
router.post('/packages/install',   authenticate, ctrl.installPackage);
router.post('/packages/uninstall', authenticate, ctrl.uninstallPackage);

// Model management
router.post('/models/fetch',  authenticate, ctrl.fetchModels);
router.post('/models/add',    authenticate, ctrl.addModel);
router.post('/models/remove', authenticate, ctrl.removeModel);

module.exports = router;
