'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');

const { getRegistry } = require('../modules/registry');

// GET /api/modules
exports.listModules = (req, res) => {
  const registry  = getRegistry();
  const grouped   = registry.getByCategory();
  sendSuccess(res, { categories: grouped, total: registry.size });
};

// GET /api/modules/:id
exports.getModule = (req, res) => {
  const registry = getRegistry();
  const mod      = registry.getById(req.params.id);
  if (!mod) {
    return res.status(404).json({ success: false, error: { message: `Module "${req.params.id}" not found` } });
  }
  sendSuccess(res, { module: mod.meta });
};
