'use strict';

const router       = require('express').Router();
const authenticate = require('../middleware/authenticate');
const adminOnly    = require('../middleware/adminOnly');
const ctrl         = require('../controllers/ragController');

// All RAG routes require authentication
router.use(authenticate);

router.post('/search', ctrl.search);
router.get('/stats',   ctrl.stats);

// Ingestion requires admin privileges
router.post('/ingest', adminOnly, ctrl.ingest);

module.exports = router;
