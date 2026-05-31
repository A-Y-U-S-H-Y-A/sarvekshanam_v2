'use strict';

const { EventEmitter } = require('events');
const { exec }         = require('child_process');
const crypto           = require('crypto');
const { getDb }        = require('../db/database');
const config           = require('../config');

/**
 * CommandService
 *
 * Manages the command submission → approval → execution lifecycle.
 * All state is persisted in the command_history SQLite table.
 * Emits events consumed by the WebSocket hub.
 *
 * Statuses: pending → approved|rejected → executing → executed|failed
 */
class CommandService extends EventEmitter {
  // ── Submit ────────────────────────────────────────────────────────────────

  async submit(userId, username, command, runnerId) {
    if (!command || !command.trim()) {
      throw Object.assign(new Error('Command cannot be empty'), { status: 400 });
    }
    if (!runnerId) {
      throw Object.assign(new Error('Runner ID is required'), { status: 400 });
    }

    if (!config.isCommandAllowed(command)) {
      throw Object.assign(
        new Error(`Command not in allowlist. Allowed: ${config.allowedCommands}`),
        { status: 403 }
      );
    }

    const { CommandHistory } = getDb();
    const id = crypto.randomUUID();
    
    await CommandHistory.create({
      id, user_id: userId, username, command, runner_id: runnerId,
      status: 'pending'
    });

    const record = await this._getById(id);
    this.emit('command:update', record);
    return record;
  }

  // ── Approve & Execute ─────────────────────────────────────────────────────

  async approve(adminId, commandId) {
    const { CommandHistory } = getDb();
    const cmd = await this._getById(commandId);
    if (!cmd) throw Object.assign(new Error('Command not found'), { status: 404 });
    if (cmd.status !== 'pending') {
      throw Object.assign(new Error(`Cannot approve command in status "${cmd.status}"`), { status: 409 });
    }

    await CommandHistory.update({
      status: 'approved',
      resolved_by: adminId,
      resolved_at: new Date()
    }, { where: { id: commandId } });

    this.emit('command:update', await this._getById(commandId));
    return this._execute(commandId);
  }

  // ── Reject ────────────────────────────────────────────────────────────────

  async reject(adminId, commandId, reason) {
    const { CommandHistory } = getDb();
    const cmd = await this._getById(commandId);
    if (!cmd) throw Object.assign(new Error('Command not found'), { status: 404 });
    if (cmd.status !== 'pending') {
      throw Object.assign(new Error(`Cannot reject command in status "${cmd.status}"`), { status: 409 });
    }

    await CommandHistory.update({
      status: 'rejected',
      resolved_by: adminId,
      resolved_at: new Date(),
      reason: reason || null
    }, { where: { id: commandId } });

    const record = await this._getById(commandId);
    this.emit('command:update', record);
    return record;
  }

  // ── History ───────────────────────────────────────────────────────────────

  async getHistory({ userId, role, status, page = 1, limit = 30 } = {}) {
    const { CommandHistory } = getDb();
    const offset = (page - 1) * limit;
    const where = {};

    if (role !== 'admin') {
      where.user_id = userId;
    }
    if (status) {
      where.status = status;
    }

    const { count, rows } = await CommandHistory.findAndCountAll({
      where,
      order: [['requested_at', 'DESC']],
      limit,
      offset
    });

    return { commands: rows.map(r => this._fromModel(r)), total: count };
  }

  async getCommand(id) {
    return this._getById(id);
  }

  // ── Internal execution ────────────────────────────────────────────────────

  async _execute(commandId) {
    const { CommandHistory } = getDb();
    const cmd = await this._getById(commandId);
    
    await CommandHistory.update({
      status: 'executing',
      executed_at: new Date()
    }, { where: { id: commandId } });
    
    this.emit('command:update', await this._getById(commandId));

    const { getRunnerService } = require('./runnerService');
    const runner = await getRunnerService().getRunnerById(cmd.runnerId);
    if (!runner) {
      await CommandHistory.update({ status: 'failed', error: 'Runner not found', completed_at: new Date() }, { where: { id: commandId } });
      const record = await this._getById(commandId);
      this.emit('command:update', record);
      return record;
    }

    const { getJwksManager } = require('../auth/jwks');
    let token = '';
    try {
      token = getJwksManager().signSlaveToken({ runnerId: runner.id, action: 'admin_approved_cmd' });
    } catch (e) {
      console.warn('Warning: Could not sign slave token for runner command:', e.message);
    }

    return new Promise(async (resolve) => {
      try {
        const resp = await fetch(`${runner.url}/run-cmd`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {})
          },
          body: JSON.stringify({ command: cmd.command })
        });
        
        if (!resp.ok) {
          const errMsg = await resp.text();
          throw new Error(`Runner returned status: ${resp.status} - ${errMsg}`);
        }

        let stdout = '';
        let stderr = '';
        let finalExitCode = 0;
        let finalError = '';

        const reader = resp.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split('\n');
          buffer = lines.pop(); // Keep the incomplete line

          for (const line of lines) {
            if (line.startsWith('data: ')) {
              try {
                const dataStr = line.substring(6);
                if (!dataStr) continue;
                const event = JSON.parse(dataStr);
                
                if (event.type === 'stdout') {
                  stdout += event.line + '\n';
                } else if (event.type === 'stderr') {
                  stderr += event.line + '\n';
                } else if (event.type === 'error') {
                  finalError = event.error;
                } else if (event.type === 'done') {
                  finalExitCode = event.exit_code || 0;
                }
              } catch (e) {
                console.error('Error parsing SSE data chunk:', e.message);
              }
            }
          }
        }

        const status = (finalExitCode === 0 && !finalError) ? 'executed' : 'failed';
        const error = finalError || (finalExitCode !== 0 ? `Process exited with code ${finalExitCode}\n${stderr}` : stderr || null);

        await CommandHistory.update({
          status,
          output: stdout || '',
          error,
          completed_at: new Date()
        }, { where: { id: commandId } });

        const record = await this._getById(commandId);
        this.emit('command:update', record);
        resolve(record);

      } catch (err) {
        await CommandHistory.update({
          status: 'failed',
          error: err.message,
          completed_at: new Date()
        }, { where: { id: commandId } });
        const record = await this._getById(commandId);
        this.emit('command:update', record);
        resolve(record);
      }
    });
  }

  async _getById(id) {
    const { CommandHistory } = getDb();
    const row = await CommandHistory.findByPk(id);
    return row ? this._fromModel(row) : null;
  }

  _fromModel(row) {
    return {
      id:          row.id,
      userId:      row.user_id,
      username:    row.username,
      command:     row.command,
      runnerId:    row.runner_id,
      status:      row.status,
      reason:      row.reason,
      requestedAt: row.requested_at ? row.requested_at.toISOString() : null,
      resolvedBy:  row.resolved_by,
      resolvedAt:  row.resolved_at ? row.resolved_at.toISOString() : null,
      executedAt:  row.executed_at ? row.executed_at.toISOString() : null,
      completedAt: row.completed_at ? row.completed_at.toISOString() : null,
      output:      row.output,
      error:       row.error,
    };
  }
}

let _instance = null;
function getCommandService() {
  if (!_instance) _instance = new CommandService();
  return _instance;
}
function _resetCommandService() { _instance = null; }

module.exports = { getCommandService, CommandService, _resetCommandService };
