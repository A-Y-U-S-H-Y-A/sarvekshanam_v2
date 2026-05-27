'use strict';

const { EventEmitter } = require('events');
const crypto           = require('crypto');
const { getDb }        = require('../db/database');

/**
 * AppointmentService
 *
 * Manages appointments — the universal state container that groups scans,
 * chats, and context into a single operational unit.
 * Emits 'appointment:update' events consumed by the WebSocket hub.
 */
class AppointmentService extends EventEmitter {
  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId, { name, mode = 'manual' }) {
    const { Appointment } = getDb();
    const id = crypto.randomUUID();

    await Appointment.create({
      id,
      user_id: userId,
      name,
      mode,
      status: 'active'
    });

    const appointment = await this._getById(id);
    this.emit('appointment:update', appointment);
    return appointment;
  }

  async get(id) {
    return this._getById(id);
  }

  async list(userId, { page = 1, limit = 20, status } = {}) {
    const { Appointment } = getDb();
    const offset = (page - 1) * limit;
    const where = { user_id: userId };

    if (status) {
      where.status = status;
    }

    const { count, rows } = await Appointment.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return { appointments: rows.map(r => this._fromModel(r)), total: count };
  }

  async update(id, patch) {
    const { Appointment } = getDb();
    const appointment = await this._getById(id);
    if (!appointment) return null;

    const updates = {};
    if (patch.name !== undefined)   updates.name   = patch.name;
    if (patch.mode !== undefined)   updates.mode   = patch.mode;
    if (patch.status !== undefined) updates.status = patch.status;
    updates.updated_at = new Date();

    await Appointment.update(updates, { where: { id } });

    const updated = await this._getById(id);
    this.emit('appointment:update', updated);
    return updated;
  }

  async delete(id) {
    const { Appointment } = getDb();
    await Appointment.destroy({ where: { id } });
  }

  // ── Link operations ───────────────────────────────────────────────────────

  async linkScan(appointmentId, scanSessionId) {
    const { ScanSession } = getDb();
    await ScanSession.update(
      { appointment_id: appointmentId },
      { where: { id: scanSessionId } }
    );

    const appointment = await this._getById(appointmentId);
    this.emit('appointment:update', appointment);
    return appointment;
  }

  async linkChat(appointmentId, { provider, model, messages, title }) {
    const { AppointmentChat } = getDb();
    const id = crypto.randomUUID();

    await AppointmentChat.create({
      id,
      appointment_id: appointmentId,
      provider: provider || null,
      model:    model || null,
      title:    title || null,
      messages_json: JSON.stringify(messages || [])
    });

    const chat = await AppointmentChat.findByPk(id);
    this.emit('appointment:update', await this._getById(appointmentId));
    return this._chatFromModel(chat);
  }

  async updateChatTitle(chatId, title) {
    const { AppointmentChat } = getDb();
    await AppointmentChat.update({ title }, { where: { id: chatId } });
  }

  async updateChatMessages(chatId, messages) {
    const { AppointmentChat } = getDb();
    await AppointmentChat.update(
      { messages_json: JSON.stringify(messages || []) },
      { where: { id: chatId } }
    );
  }

  async getScans(appointmentId) {
    const { ScanSession } = getDb();
    const rows = await ScanSession.findAll({
      where: { appointment_id: appointmentId },
      order: [['created_at', 'DESC']]
    });
    return rows.map(r => ({
      id:        r.id,
      userId:    r.user_id,
      name:      r.name,
      mode:      r.mode,
      status:    r.status,
      createdAt: r.created_at ? r.created_at.toISOString() : null,
    }));
  }

  async getChats(appointmentId) {
    const { AppointmentChat } = getDb();
    const rows = await AppointmentChat.findAll({
      where: { appointment_id: appointmentId },
      order: [['created_at', 'ASC']]
    });
    return rows.map(r => this._chatFromModel(r));
  }

  async getFullContext(appointmentId) {
    const appointment = await this._getById(appointmentId);
    if (!appointment) return null;

    const scans = await this.getScans(appointmentId);
    const chats = await this.getChats(appointmentId);

    return {
      ...appointment,
      scans,
      chats
    };
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  async _getById(id) {
    const { Appointment } = getDb();
    const row = await Appointment.findByPk(id);
    return row ? this._fromModel(row) : null;
  }

  _fromModel(row) {
    return {
      id:        row.id,
      userId:    row.user_id,
      name:      row.name,
      mode:      row.mode,
      status:    row.status,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  _chatFromModel(row) {
    return {
      id:            row.id,
      appointmentId: row.appointment_id,
      provider:      row.provider,
      model:         row.model,
      title:         row.title || null,
      messages:      this._tryParse(row.messages_json, []),
      createdAt:     row.created_at ? row.created_at.toISOString() : null,
    };
  }

  _tryParse(val, fallback) {
    if (val === null || val === undefined) return fallback;
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (_) { return fallback; }
  }
}

// Singleton
let _instance = null;
function getAppointmentService() {
  if (!_instance) _instance = new AppointmentService();
  return _instance;
}
function _resetAppointmentService() { _instance = null; }

module.exports = { getAppointmentService, AppointmentService, _resetAppointmentService };
