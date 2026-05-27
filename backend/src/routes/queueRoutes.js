'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const { getExecutionQueueService } = require('../services/executionQueueService');
const router = express.Router();

router.use(authenticate);

// GET /api/queue/status
router.get('/status', (req, res) => {
  const qSvc = getExecutionQueueService();
  res.json(qSvc.getQueueStatus());
});

module.exports = router;
