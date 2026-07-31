'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');

const { getAppointmentService } = require('../services/appointmentService');

function svc() { return getAppointmentService(); }

async function checkAccess(req, res, id) {
  const appointment = await svc().get(id);
  if (!appointment) {
    sendNotFound(res, 'Appointment not found');
    return null;
  }
  if (String(appointment.userId) !== String(req.user.id) && req.user.role !== 'admin') {
    sendForbidden(res, 'Forbidden');
    return null;
  }
  return appointment;
}

// POST /api/appointments
exports.create = asyncHandler(async (req, res, next) => {
    const { name, mode } = req.body;
    if (!name) {
      return sendError(res, 'name is required');
    }
    const appointment = await svc().create(req.user.id, { name, mode });
    return sendSuccess(res, { appointment }, 201);
  });

// GET /api/appointments
exports.list = asyncHandler(async (req, res, next) => {
    const { page, limit, status } = req.query;
    const result = await svc().list(req.user.id, {
      page:   page  ? parseInt(page, 10)  : 1,
      limit:  limit ? parseInt(limit, 10) : 20,
      status: status || undefined,
    });
    return sendSuccess(res, result);
  });

// GET /api/appointments/:id
exports.get = asyncHandler(async (req, res, next) => {
    const appointment = await checkAccess(req, res, req.params.id);
    if (!appointment) return;
    return sendSuccess(res, { appointment });
  });

// PUT /api/appointments/:id
exports.update = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const appointment = await svc().update(req.params.id, req.body);
    return sendSuccess(res, { appointment });
  });

// DELETE /api/appointments/:id
exports.remove = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    await svc().delete(req.params.id);
    return sendSuccess(res, { message: 'Appointment deleted' });
  });

// GET /api/appointments/:id/scans
exports.getScans = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const scans = await svc().getScans(req.params.id);
    return sendSuccess(res, { scans });
  });

// GET /api/appointments/:id/chats
exports.getChats = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const chats = await svc().getChats(req.params.id);
    return sendSuccess(res, { chats });
  });

// POST /api/appointments/:id/chats
exports.createChat = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const { provider, model, messages, title } = req.body;
    const chat = await svc().linkChat(req.params.id, { provider, model, messages, title });
    return sendSuccess(res, { chat }, 201);
  });

// PUT /api/appointments/:id/chats/:chatId/title
exports.updateChatTitle = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const { title } = req.body;
    if (!title) return sendError(res, 'title is required');
    await svc().updateChatTitle(req.params.chatId, title);
    return sendSuccess(res, { message: 'Title updated' });
  });

// GET /api/appointments/:id/context
exports.getFullContext = asyncHandler(async (req, res, next) => {
    const access = await checkAccess(req, res, req.params.id);
    if (!access) return;
    const context = await svc().getFullContext(req.params.id);
    return sendSuccess(res, { context });
  });
