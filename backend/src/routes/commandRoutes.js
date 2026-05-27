'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const adminOnly    = require('../middleware/adminOnly');
const ctrl         = require('../controllers/commandController');

router.post('/',                authenticate,           ctrl.submit);
router.get('/',                 authenticate,           ctrl.list);
router.get('/:id',              authenticate,           ctrl.getOne);
router.post('/:id/approve',     authenticate, adminOnly, ctrl.approve);
router.post('/:id/reject',      authenticate, adminOnly, ctrl.reject);

module.exports = router;
