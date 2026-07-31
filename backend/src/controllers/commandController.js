'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const { getCommandService } = require('../services/commandService');
const asyncHandler = require('../utils/asyncHandler');

// POST /api/commands — submit a command
exports.submit = asyncHandler(async (req, res, next) => {
  const { command, runnerId } = req.body;
  const svc    = getCommandService();
  const record = await svc.submit(req.user.id, req.user.username, command, runnerId);
  sendSuccess(res, { command: record }, 202);
});

// GET /api/commands — list commands (admin: all, user: own)
exports.list = asyncHandler(async (req, res, next) => {
  const { status, page = 1, limit = 30 } = req.query;
  const svc    = getCommandService();
  const result = await svc.getHistory({
    userId: req.user.id,
    role:   req.user.role,
    status,
    page:   parseInt(page, 10),
    limit:  parseInt(limit, 10),
  });
  sendSuccess(res, result);
});

// GET /api/commands/:id
exports.getOne = asyncHandler(async (req, res, next) => {
  const svc = getCommandService();
  const cmd = await svc.getCommand(req.params.id);
  if (!cmd) return sendNotFound(res, 'Command not found');
  if (cmd.userId !== req.user.id && req.user.role !== 'admin') {
    return sendForbidden(res, 'Forbidden');
  }
  sendSuccess(res, { command: cmd });
});

// POST /api/commands/:id/approve — admin only
exports.approve = asyncHandler(async (req, res, next) => {
  const svc    = getCommandService();
  const record = await svc.approve(req.user.id, req.params.id);
  sendSuccess(res, { command: record });
});

// POST /api/commands/:id/reject — admin only
exports.reject = asyncHandler(async (req, res, next) => {
  const { reason } = req.body;
  const svc    = getCommandService();
  const record = await svc.reject(req.user.id, req.params.id, reason);
  sendSuccess(res, { command: record });
});
