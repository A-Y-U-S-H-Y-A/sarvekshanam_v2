'use strict';

const { getAppointmentService } = require('../services/appointmentService');

function svc() { return getAppointmentService(); }

// POST /api/appointments
exports.create = async (req, res, next) => {
  try {
    const { name, mode } = req.body;
    if (!name) {
      return res.status(400).json({ success: false, error: { message: 'name is required' } });
    }
    const appointment = await svc().create(req.user.id, { name, mode });
    return res.status(201).json({ success: true, data: { appointment } });
  } catch (err) { next(err); }
};

// GET /api/appointments
exports.list = async (req, res, next) => {
  try {
    const { page, limit, status } = req.query;
    const result = await svc().list(req.user.id, {
      page:   page  ? parseInt(page, 10)  : 1,
      limit:  limit ? parseInt(limit, 10) : 20,
      status: status || undefined,
    });
    return res.json({ success: true, data: result });
  } catch (err) { next(err); }
};

// GET /api/appointments/:id
exports.get = async (req, res, next) => {
  try {
    const appointment = await svc().get(req.params.id);
    if (!appointment) {
      return res.status(404).json({ success: false, error: { message: 'Appointment not found' } });
    }
    return res.json({ success: true, data: { appointment } });
  } catch (err) { next(err); }
};

// PUT /api/appointments/:id
exports.update = async (req, res, next) => {
  try {
    const appointment = await svc().update(req.params.id, req.body);
    if (!appointment) {
      return res.status(404).json({ success: false, error: { message: 'Appointment not found' } });
    }
    return res.json({ success: true, data: { appointment } });
  } catch (err) { next(err); }
};

// DELETE /api/appointments/:id
exports.remove = async (req, res, next) => {
  try {
    await svc().delete(req.params.id);
    return res.json({ success: true, data: { message: 'Appointment deleted' } });
  } catch (err) { next(err); }
};

// GET /api/appointments/:id/scans
exports.getScans = async (req, res, next) => {
  try {
    const scans = await svc().getScans(req.params.id);
    return res.json({ success: true, data: { scans } });
  } catch (err) { next(err); }
};

// GET /api/appointments/:id/chats
exports.getChats = async (req, res, next) => {
  try {
    const chats = await svc().getChats(req.params.id);
    return res.json({ success: true, data: { chats } });
  } catch (err) { next(err); }
};

// POST /api/appointments/:id/chats
exports.createChat = async (req, res, next) => {
  try {
    const { provider, model, messages, title } = req.body;
    const chat = await svc().linkChat(req.params.id, { provider, model, messages, title });
    return res.status(201).json({ success: true, data: { chat } });
  } catch (err) { next(err); }
};

// PUT /api/appointments/:id/chats/:chatId/title
exports.updateChatTitle = async (req, res, next) => {
  try {
    const { title } = req.body;
    if (!title) return res.status(400).json({ success: false, error: { message: 'title is required' } });
    await svc().updateChatTitle(req.params.chatId, title);
    return res.json({ success: true, data: { message: 'Title updated' } });
  } catch (err) { next(err); }
};

// GET /api/appointments/:id/context
exports.getFullContext = async (req, res, next) => {
  try {
    const context = await svc().getFullContext(req.params.id);
    if (!context) {
      return res.status(404).json({ success: false, error: { message: 'Appointment not found' } });
    }
    return res.json({ success: true, data: { context } });
  } catch (err) { next(err); }
};
