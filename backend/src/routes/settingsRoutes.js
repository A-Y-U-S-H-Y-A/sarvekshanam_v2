'use strict';

const fs = require('fs');
const path = require('path');
const router = require('express').Router();
const authenticate = require('../middleware/authenticate');
const adminOnly = require('../middleware/adminOnly');
const { getProxyService } = require('../services/proxyService');

// GET /api/settings/proxy
router.get('/proxy', authenticate, (req, res) => {
  const svc = getProxyService();
  res.json({ success: true, data: svc.getInfo() });
});

// POST /api/settings/proxy
router.post('/proxy', authenticate, adminOnly, (req, res) => {
  const { mode, target } = req.body;
  if (!['none', 'hop', 'direct'].includes(mode)) {
    return res.status(400).json({ success: false, error: { message: 'Invalid proxy mode' } });
  }

  const svc = getProxyService();
  svc.mode = mode;
  svc.target = target || '';

  // Optionally persist to .env file if it exists
  try {
    const envPath = path.join(__dirname, '../../.env');
    if (fs.existsSync(envPath)) {
      let content = fs.readFileSync(envPath, 'utf8');
      content = content.replace(/^PROXY_MODE=.*$/m, `PROXY_MODE=${svc.mode}`);
      if (content.match(/^PROXY_TARGET=.*$/m)) {
        content = content.replace(/^PROXY_TARGET=.*$/m, `PROXY_TARGET=${svc.target}`);
      } else {
        content += `\nPROXY_TARGET=${svc.target}`;
      }
      fs.writeFileSync(envPath, content);
    }
  } catch (err) {
    console.error('Failed to update .env', err);
  }

  res.json({ success: true, data: svc.getInfo() });
});

module.exports = router;
