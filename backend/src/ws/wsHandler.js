'use strict';

const WebSocket = require('ws');
const jwt       = require('jsonwebtoken');
const config    = require('../config');

/**
 * WebSocket Hub
 *
 * Protocol (JSON messages):
 *   Client → Server:
 *     { type: "AUTH",        token: "<jwt>" }
 *     { type: "SUBSCRIBE",   sessionId: "<id>" }
 *     { type: "UNSUBSCRIBE", sessionId: "<id>" }
 *     { type: "PING" }
 *
 *   Server → Client:
 *     { type: "AUTH_OK",        user: { id, username, role } }
 *     { type: "AUTH_ERROR",     message: "..." }
 *     { type: "SCAN_UPDATE",    session: {...} }
 *     { type: "COMMAND_STATUS", command: {...} }
 *     { type: "PONG" }
 *     { type: "ERROR",          message: "..." }
 */
class WsHandler {
  constructor() {
    /** @type {Map<WebSocket, { user: object|null, subscriptions: Set<string> }>} */
    this._clients = new Map();
    /** @type {Map<string, Set<WebSocket>>} sessionId → ws set */
    this._sessionSubs = new Map();
    /** @type {Set<WebSocket>} admin connections */
    this._admins = new Set();
  }

  /**
   * Attach to a ws.Server instance.
   * @param {WebSocket.Server} wss
   * @param {{ scanSessionService, commandService }} services
   */
  attach(wss, { scanSessionService, commandService, appointmentService }) {
    // Listen for scan updates → broadcast to session subscribers
    scanSessionService.on('session:update', (session) => {
      this._broadcastToSession(session.id, { type: 'SCAN_UPDATE', session });
    });

    // Listen for command updates → broadcast to admins + the submitter
    commandService.on('command:update', (command) => {
      this._broadcastCommandUpdate(command);
    });

    // Listen for appointment updates → broadcast to all authenticated clients
    if (appointmentService) {
      appointmentService.on('appointment:update', (appointment) => {
        this.broadcastAll({ type: 'APPOINTMENT_UPDATE', appointment });
      });
    }

    wss.on('connection', (ws) => {
      this._clients.set(ws, { user: null, subscriptions: new Set() });

      ws.on('message', (raw) => this._onMessage(ws, raw));
      ws.on('close',   ()    => this._onClose(ws));
      ws.on('error',   (err) => console.error('[WS] Client error:', err.message));
    });
  }

  // ── Message dispatch ───────────────────────────────────────────────────────

  _onMessage(ws, raw) {
    let msg;
    try { msg = JSON.parse(raw); } catch (_) {
      return this._send(ws, { type: 'ERROR', message: 'Invalid JSON' });
    }

    switch (msg.type) {
      case 'AUTH':        return this._handleAuth(ws, msg);
      case 'SUBSCRIBE':   return this._handleSubscribe(ws, msg);
      case 'UNSUBSCRIBE': return this._handleUnsubscribe(ws, msg);
      case 'PING':        return this._send(ws, { type: 'PONG' });
      default:
        this._send(ws, { type: 'ERROR', message: `Unknown message type: ${msg.type}` });
    }
  }

  _handleAuth(ws, msg) {
    try {
      const payload = jwt.verify(msg.token, config.jwtSecret);
      const client  = this._clients.get(ws);
      client.user = { id: payload.id, username: payload.username, role: payload.role };

      if (payload.role === 'admin') this._admins.add(ws);
      this._send(ws, { type: 'AUTH_OK', user: client.user });
    } catch (_) {
      this._send(ws, { type: 'AUTH_ERROR', message: 'Invalid or expired token' });
    }
  }

  _handleSubscribe(ws, msg) {
    const client = this._clients.get(ws);
    if (!client?.user) return this._send(ws, { type: 'ERROR', message: 'Authenticate first' });

    const sid = msg.sessionId;
    if (!sid)  return this._send(ws, { type: 'ERROR', message: 'sessionId required' });

    client.subscriptions.add(sid);
    if (!this._sessionSubs.has(sid)) this._sessionSubs.set(sid, new Set());
    this._sessionSubs.get(sid).add(ws);
  }

  _handleUnsubscribe(ws, msg) {
    const sid = msg.sessionId;
    if (!sid) return;
    const client = this._clients.get(ws);
    if (client) client.subscriptions.delete(sid);
    this._sessionSubs.get(sid)?.delete(ws);
  }

  _onClose(ws) {
    const client = this._clients.get(ws);
    if (client) {
      for (const sid of client.subscriptions) {
        this._sessionSubs.get(sid)?.delete(ws);
      }
    }
    this._admins.delete(ws);
    this._clients.delete(ws);
  }

  // ── Broadcast helpers ─────────────────────────────────────────────────────

  _broadcastToSession(sessionId, payload) {
    const subs = this._sessionSubs.get(sessionId);
    if (!subs) return;
    const msg = JSON.stringify(payload);
    for (const ws of subs) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  _broadcastCommandUpdate(command) {
    const msg = JSON.stringify({ type: 'COMMAND_STATUS', command });
    const adminMsg = msg; // same payload for simplicity

    // All admins get every command update
    for (const ws of this._admins) {
      if (ws.readyState === WebSocket.OPEN) ws.send(adminMsg);
    }

    // Submitter also gets their own updates
    for (const [ws, client] of this._clients) {
      if (client.user?.id === command.userId && !this._admins.has(ws)) {
        if (ws.readyState === WebSocket.OPEN) ws.send(msg);
      }
    }
  }

  _send(ws, payload) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  /** Broadcast to ALL connected clients (for announcements). */
  broadcastAll(payload) {
    const msg = JSON.stringify(payload);
    for (const ws of this._clients.keys()) {
      if (ws.readyState === WebSocket.OPEN) ws.send(msg);
    }
  }

  /** Broadcast to specific user ID */
  broadcastToUser(userId, payload) {
    const msg = JSON.stringify(payload);
    for (const [ws, client] of this._clients) {
      if (client.user?.id === userId && ws.readyState === WebSocket.OPEN) {
        ws.send(msg);
      }
    }
  }

  get clientCount() {
    return this._clients.size;
  }
}

let _instance = null;
function getWsHandler() {
  if (!_instance) _instance = new WsHandler();
  return _instance;
}
function _resetWsHandler() { _instance = null; }

module.exports = { getWsHandler, WsHandler, _resetWsHandler };
