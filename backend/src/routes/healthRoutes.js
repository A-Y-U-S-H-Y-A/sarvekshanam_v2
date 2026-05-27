'use strict';

const router = require('express').Router();

router.get('/health', (req, res) => {
  res.json({
    success: true,
    data: {
      status:    'ok',
      service:   'Sarvekshanam',
      version:   require('../../package.json').version,
      timestamp: new Date().toISOString(),
      uptime:    Math.floor(process.uptime()),
    },
  });
});

module.exports = router;
