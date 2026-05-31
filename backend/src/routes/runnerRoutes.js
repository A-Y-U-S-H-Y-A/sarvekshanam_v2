'use strict';

const router = require('express').Router();
const authorizeAdmin = require('../middleware/adminOnly');
const authenticate   = require('../middleware/authenticate');
const { getRunnerService } = require('../services/runnerService');

// All runner routes require authentication.
router.use(authenticate);

// List all runners
router.get('/', async (req, res) => {
  try {
    const runners = await getRunnerService().getRunners();
    res.json({ success: true, data: runners });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Admin only operations for managing runners
router.post('/', authorizeAdmin, async (req, res) => {
  try {
    const { name, url } = req.body;
    if (!name || !url) {
      return res.status(400).json({ success: false, error: { message: 'name and url are required' } });
    }
    const runner = await getRunnerService().createRunner({ name, url });
    res.status(201).json({ success: true, data: runner });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.put('/:id', authorizeAdmin, async (req, res) => {
  try {
    const { name, url } = req.body;
    const runner = await getRunnerService().updateRunner(req.params.id, { name, url });
    if (!runner) return res.status(404).json({ success: false, error: { message: 'Runner not found' } });
    res.json({ success: true, data: runner });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

router.delete('/:id', authorizeAdmin, async (req, res) => {
  try {
    await getRunnerService().deleteRunner(req.params.id);
    res.json({ success: true, data: null });
  } catch (err) {
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

// Run a module on a runner
router.post('/:id/run', authorizeAdmin, async (req, res, next) => {
  try {
    const { module, args } = req.body;
    if (!module) return res.status(400).json({ success: false, error: { message: 'module is required' } });
    
    const result = await getRunnerService().runModuleOnHost(req.params.id, module, args || []);
    res.json({ success: true, data: result });
  } catch (err) {
    // Or pass to next(err) if there's a global error handler wrapper
    res.status(500).json({ success: false, error: { message: err.message } });
  }
});

module.exports = router;
