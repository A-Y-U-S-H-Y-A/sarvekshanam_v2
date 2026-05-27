'use strict';

const { getCommandService } = require('../services/commandService');

// POST /api/commands — submit a command
exports.submit = async (req, res, next) => {
  try {
    const { command, runnerId } = req.body;
    const svc    = getCommandService();
    const record = await svc.submit(req.user.id, req.user.username, command, runnerId);
    res.status(202).json({ success: true, data: { command: record } });
  } catch (err) {
    next(err);
  }
};

// GET /api/commands — list commands (admin: all, user: own)
exports.list = async (req, res, next) => {
  try {
    const { status, page = 1, limit = 30 } = req.query;
    const svc    = getCommandService();
    const result = await svc.getHistory({
      userId: req.user.id,
      role:   req.user.role,
      status,
      page:   parseInt(page, 10),
      limit:  parseInt(limit, 10),
    });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/commands/:id
exports.getOne = async (req, res, next) => {
  try {
    const svc = getCommandService();
    const cmd = await svc.getCommand(req.params.id);
    if (!cmd) return res.status(404).json({ success: false, error: { message: 'Command not found' } });
    if (cmd.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    res.json({ success: true, data: { command: cmd } });
  } catch (err) {
    next(err);
  }
};

// POST /api/commands/:id/approve — admin only
exports.approve = async (req, res, next) => {
  try {
    const svc    = getCommandService();
    const record = await svc.approve(req.user.id, req.params.id);
    res.json({ success: true, data: { command: record } });
  } catch (err) {
    next(err);
  }
};

// POST /api/commands/:id/reject — admin only
exports.reject = async (req, res, next) => {
  try {
    const { reason } = req.body;
    const svc    = getCommandService();
    const record = await svc.reject(req.user.id, req.params.id, reason);
    res.json({ success: true, data: { command: record } });
  } catch (err) {
    next(err);
  }
};
