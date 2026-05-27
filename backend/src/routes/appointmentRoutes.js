'use strict';

const router      = require('express').Router();
const authenticate = require('../middleware/authenticate');
const ctrl        = require('../controllers/appointmentController');

// All appointment routes require authentication
router.use(authenticate);

router.post('/',            ctrl.create);
router.get('/',             ctrl.list);
router.get('/:id',          ctrl.get);
router.put('/:id',          ctrl.update);
router.delete('/:id',       ctrl.remove);
router.get('/:id/scans',    ctrl.getScans);
router.get('/:id/chats',    ctrl.getChats);
router.post('/:id/chats',   ctrl.createChat);
router.put('/:id/chats/:chatId/title', ctrl.updateChatTitle);
router.get('/:id/context',  ctrl.getFullContext);

module.exports = router;
