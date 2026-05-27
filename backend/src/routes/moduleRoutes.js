'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const ctrl         = require('../controllers/moduleController');

router.get('/',    authenticate, ctrl.listModules);
router.get('/:id', authenticate, ctrl.getModule);

module.exports = router;
