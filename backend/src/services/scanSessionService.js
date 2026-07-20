'use strict';

const { EventEmitter } = require('events');
const crypto           = require('crypto');
const { getDb }        = require('../db/database');
const { AppointmentChat } = require('../db/models/AppointmentChat');
const registryModule  = require('../modules/registry');
const { getVectorService } = require('./vectorService');

/**
 * ScanSessionService
 *
 * Manages scan sessions in both memory (for speed) and SQLite (for persistence).
 * Emits 'session:update' events consumed by the WebSocket hub.
 */
class ScanSessionService extends EventEmitter {
  constructor() {
    super();
    /** @type {Map<string, object>} Fast in-process cache */
    this._cache = new Map();
  }

  // ── CRUD ──────────────────────────────────────────────────────────────────

  async create(userId, { name, mode = 'single', targets, moduleIds, params = {}, appointmentId = null, runnerId = null, proxyConfig = null }) {
    const { ScanSession } = getDb();
    const id = crypto.randomUUID();
    
    await ScanSession.create({
      id,
      user_id: userId,
      appointment_id: appointmentId,
      name: name || `Scan ${new Date().toLocaleTimeString()}`,
      mode,
      runner_id: runnerId,
      proxy_config: proxyConfig ? JSON.stringify(proxyConfig) : null,
      targets: JSON.stringify(targets),
      module_ids: JSON.stringify(moduleIds),
      params: JSON.stringify(params),
      status: 'pending',
      retry_count: 0,
      max_retries: 5
    });

    const session = await this._getById(id);
    this._cache.set(id, session);
    return session;
  }

  async get(id) {
    if (this._cache.has(id)) return this._cache.get(id);
    const session = await this._getById(id);
    if (!session) return null;
    this._cache.set(id, session);
    return session;
  }

  async list(userId, { page = 1, limit = 20, status, appointmentId } = {}) {
    const { ScanSession } = getDb();
    const offset = (page - 1) * limit;
    const where = { user_id: userId };
    
    if (status) {
      where.status = status;
    }
    if (appointmentId) {
      where.appointment_id = appointmentId;
    }

    const { count, rows } = await ScanSession.findAndCountAll({
      where,
      order: [['created_at', 'DESC']],
      limit,
      offset
    });

    return { sessions: rows.map(r => this._fromModel(r)), total: count };
  }

  async update(id, patch) {
    const session = await this.get(id);
    if (!session) return null;

    const updated = {
      ...session,
      ...patch,
      updated_at: new Date()
    };

    const { ScanSession } = getDb();
    await ScanSession.update({
      status: updated.status,
      result_json: updated.results ? JSON.stringify(updated.results) : null,
      error: updated.error || null,
      name: updated.name,
      updated_at: updated.updated_at
    }, { where: { id } });

    const freshSession = await this._getById(id);
    this._cache.set(id, freshSession);
    this.emit('session:update', freshSession);
    return freshSession;
  }

  async delete(id) {
    const { ScanSession } = getDb();
    await ScanSession.destroy({ where: { id } });
    this._cache.delete(id);
  }

  // ── Execution ────────────────────────────────────────────────────────────

  async run(sessionId, opts = {}) {
    const session = await this.get(sessionId);
    if (!session) throw new Error(`Session ${sessionId} not found`);

    const { getExecutionQueueService } = require('./executionQueueService');
    const queueSvc = getExecutionQueueService();
    await queueSvc.enqueue(session, opts);
    return this.get(sessionId);
  }

  async bulkCreate(userId, { name, targets, moduleIds, params = {}, runnerId = null, proxyConfig = null, appointmentId = null }) {
    if (!Array.isArray(targets)) throw new Error('targets must be an array');
    if (targets.length > 10000) throw new Error('Too many targets for bulk creation');
    const sessions = [];
    for (let i = 0; i < targets.length; i++) {
      const targetEntry = targets[i];
      const targetUri = typeof targetEntry === 'string' ? targetEntry : (targetEntry.target || targetEntry.uri);
      if (!targetUri) continue;
      
      const targetParams = typeof targetEntry === 'string' ? params : { ...params, ...(targetEntry.params || {}) };

      const session = await this.create(userId, {
        name: name ? `${name} [${i + 1}/${targets.length}]` : undefined,
        mode: 'bulk',
        runnerId,
        proxyConfig,
        appointmentId,
        targets: [targetUri],
        moduleIds,
        params: targetParams,
      });
      sessions.push(session);
    }
    return sessions;
  }

  async recoverStuckSessions() {
    const { ScanSession } = getDb();
    const { Op } = require('sequelize');
    try {
      const [updatedRowsCount] = await ScanSession.update(
        { status: 'failed_permanent', error: 'Server restarted while session was active', updated_at: new Date() },
        { where: { status: { [Op.in]: ['pending', 'running'] } } }
      );
      if (updatedRowsCount > 0) {
        console.log(`[ScanSessionService] Recovered ${updatedRowsCount} stuck sessions by marking them as failed_permanent.`);
      }
    } catch (err) {
      console.error('[ScanSessionService] Failed to recover stuck sessions:', err.message);
    }
  }

  // ── Internal ─────────────────────────────────────────────────────────────

  async _getById(id) {
    const { ScanSession } = getDb();
    const row = await ScanSession.findByPk(id);
    return row ? this._fromModel(row) : null;
  }

  _fromModel(row) {
    return {
      id:        row.id,
      userId:    row.user_id,
      name:      row.name,
      mode:      row.mode,
      targets:   this._tryParse(row.targets, []),
      moduleIds: this._tryParse(row.module_ids, []),
      params:    this._tryParse(row.params, {}),
      runnerId:  row.runner_id,
      proxyConfig: this._tryParse(row.proxy_config, null),
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      status:    row.status,
      results:   this._tryParse(row.result_json, null),
      error:     row.error,
      createdAt: row.created_at ? row.created_at.toISOString() : null,
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
    };
  }

  _tryParse(val, fallback) {
    if (val === null || val === undefined) return fallback;
    try { return typeof val === 'string' ? JSON.parse(val) : val; } catch (_parseErr) { return fallback; }
  }
}

// Singleton
let _instance = null;
function getScanSessionService() {
  if (!_instance) _instance = new ScanSessionService();
  return _instance;
}
function _resetScanSessionService() { _instance = null; }

module.exports = { getScanSessionService, ScanSessionService, _resetScanSessionService };
