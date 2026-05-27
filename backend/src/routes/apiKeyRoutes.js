'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const ctrl         = require('../controllers/apiKeyController');

// All API key routes require authentication
router.post('/',    authenticate, ctrl.create);
router.get('/',     authenticate, ctrl.list);
router.delete('/:id', authenticate, ctrl.revoke);

module.exports = router;
