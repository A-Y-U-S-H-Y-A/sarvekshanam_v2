'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const ctrl         = require('../controllers/scanController');

// Order matters: /bulk must come before /:id
router.post('/bulk', authenticate, ctrl.bulkScan);
router.post('/',     authenticate, ctrl.createScan);
router.get('/',      authenticate, ctrl.listScans);
router.post('/search', authenticate, ctrl.listScans);
router.get('/:id',   authenticate, ctrl.getScan);
router.post('/:id/retry', authenticate, ctrl.retryScan);
router.post('/:id/approve', authenticate, ctrl.approveScan);
router.delete('/:id',authenticate, ctrl.deleteScan);

module.exports = router;
