'use strict';

const { getDb } = require('../db/database');
const { getWsHandler } = require('../ws/wsHandler');
const config = require('../config');
const registryModule = require('../modules/registry');
const { getRunnerService } = require('./runnerService');
const { getVectorService } = require('./vectorService');
const { getScanSessionService } = require('./scanSessionService');

class ExecutionQueueService {
  constructor() {
    this.userQueues = new Map(); // userId -> []
    this.runningCount = 0;
    this.maxConcurrent = parseInt(process.env.MAX_CONCURRENT_PER_SLAVE || 5, 10);
    this.isProcessing = false;
  }

  async enqueue(session, opts = {}) {
    if (opts.syncExec) {
      return this._executeTask(session, opts);
    }
    if (!this.userQueues.has(session.userId)) {
      this.userQueues.set(session.userId, []);
    }
    const q = this.userQueues.get(session.userId);
    q.push({ session, opts });

    // Broadcast queue update to user
    await this._broadcastQueueUpdates(session.userId);

    this.processQueue().catch(console.error);
  }

  async _broadcastQueueUpdates(userId) {
    const q = this.userQueues.get(userId) || [];
    const wsHub = getWsHandler();
    if (!wsHub) return;

    for (let i = 0; i < q.length; i++) {
      const task = q[i];
      const position = i + 1;
      const estimatedWaitMs = await this._calculateWaitTime(task.session, position);
      
      wsHub.broadcastToUser(userId, {
        type: 'QUEUE_UPDATE',
        data: {
          sessionId: task.session.id,
          position,
          estimatedWaitMs
        }
      });
    }
  }

  async _calculateWaitTime(session, position) {
    const { ModuleExecStat } = getDb();
    let totalAvg = 0;
    
    // Simplistic estimate: sum average time of requested modules
    for (const modId of session.moduleIds) {
      const stat = await ModuleExecStat.findByPk(modId);
      if (stat && stat.avg_time_ms > 0) {
        totalAvg += stat.avg_time_ms;
      } else {
        totalAvg += 5000; // default 5s
      }
    }
    
    // Targets multiplier
    totalAvg *= (session.targets || []).length;

    const availableSlots = Math.max(1, this.maxConcurrent - this.runningCount);
    return Math.ceil(position / availableSlots) * totalAvg;
  }

  async processQueue() {
    if (this.isProcessing) return;
    this.isProcessing = true;

    try {
      while (this.runningCount < this.maxConcurrent) {
        // Find next task round-robin style
        let nextTask = null;
        let selectedUserId = null;
        
        // Very basic round-robin: just take the first user that has items.
        // For true round-robin across users, we'd cycle through userKeys.
        for (const [userId, q] of this.userQueues.entries()) {
          if (q.length > 0) {
            nextTask = q.shift();
            selectedUserId = userId;
            break;
          }
        }

        if (!nextTask) break; // All queues empty

        this.runningCount++;
        
        // Notify user that this specific task exited the queue
        const wsHub = require('../ws/wsHandler').getWsHandler();
        if (wsHub) {
          wsHub.broadcastToUser(selectedUserId, {
            type: 'QUEUE_UPDATE',
            data: {
              sessionId: nextTask.session.id,
              position: 0,
              estimatedWaitMs: 0
            }
          });
        }

        // Notify user about position change for remaining tasks
        this._broadcastQueueUpdates(selectedUserId).catch(console.error);

        // Execute task asynchronously and release slot when done
        this._executeTask(nextTask.session, nextTask.opts)
          .catch(err => console.error('[ExecutionQueueService] Unhandled task error:', err))
          .finally(() => {
            this.runningCount--;
            this.processQueue().catch(console.error);
          });
      }
    } finally {
      this.isProcessing = false;
    }
  }

  async _executeTask(session, opts) {
    const scanSessionService = getScanSessionService();

    try {
      await scanSessionService.update(session.id, { status: 'running' });
      const registry = registryModule.getRegistry();
      const results = {};

      const startTime = Date.now();

      const runOpts = { ...opts };
      if (session.runnerId) runOpts.runnerId = session.runnerId;
      if (session.proxyConfig) {
        try { runOpts.proxyConfig = typeof session.proxyConfig === 'string' ? JSON.parse(session.proxyConfig) : session.proxyConfig; } catch(e) {
          console.error('Failed to parse proxy config:', e.message);
        }
      }

      // ── 3.4: Broadcast POLL_AT so clients know when to refresh ──────────────
      const wsHub = getWsHandler();
      const avgModuleTime = await this._estimateAvgTime(session.moduleIds);
      const pollAtMs = Date.now() + (avgModuleTime * (session.targets || []).length) + 1000;
      if (wsHub) {
        wsHub.broadcastToUser(session.userId, {
          type: 'POLL_AT',
          data: { sessionId: session.id, pollAt: pollAtMs }
        });
      }

      let lastDbSave = Date.now();
      const onEvent = async (moduleId, target, event) => {
        if (wsHub) {
          wsHub.broadcastToUser(session.userId, {
            type: 'MODULE_STREAM',
            data: { sessionId: session.id, moduleId, target, event }
          });
        }
        
        // Incrementally save to DB every 2 seconds
        if (Date.now() - lastDbSave > 2000) {
          lastDbSave = Date.now();
          // Note: we just touch the updatedAt to indicate alive, 
          // or we can save the partial results if we manage it here.
          // For now, we update status to running to extend timeout.
          scanSessionService.update(session.id, { status: 'running' }).catch(err => {
            console.error('Failed to update session status to running:', err.message);
          });
        }
      };

      // ── 3.6: Prefer /run-bulk when a specific runner is pinned ───────────────
      const runnerService = getRunnerService();
      const hasExplicitRunner = !!session.runnerId;
      const hasMultipleTargets = (session.targets || []).length > 1;

      if (hasExplicitRunner && hasMultipleTargets && runnerService.runnerSupportsBulk(session.runnerId)) {
        // Single module bulk delegation
        for (const moduleId of session.moduleIds) {
          const mod = registry.getById(moduleId);
          const params = (session.params && session.params[moduleId]) || {};
          const args = Object.entries(params).flatMap(([k, v]) => [`--${k}`, String(v)]);
          try {
            const bulkResults = await runnerService.runBulkOnHost(
              session.runnerId, moduleId, session.targets, args,
              (event) => onEvent(moduleId, event.target, event)
            );
            const elapsed = Date.now() - startTime;
            await this._updateModuleStat(moduleId, Math.floor(elapsed / session.targets.length));
            for (const r of bulkResults) {
              if (!results[r.target]) results[r.target] = {};
              results[r.target][moduleId] = {
                status: r.error ? 'error' : 'completed',
                output: r.stdout || '',
                stderr: r.stderr || '',
                error: r.error
              };
            }
          } catch (err) {
            // Fallback: bulk not supported — disable for this runner
            runnerService.markBulkUnsupported(session.runnerId);
            // Fall through to per-target execution below
            for (const target of session.targets) {
              if (!results[target]) results[target] = {};
              results[target][moduleId] = { status: 'error', output: err.message };
            }
          }
          await scanSessionService.update(session.id, { status: 'running', results });
        }
      } else {
        // ── Standard per-target loop ───────────────────────────────────────────
        for (const target of session.targets) {
          results[target] = {};
          for (const moduleId of session.moduleIds) {
            const mod = registry.getById(moduleId);
            if (!mod) {
              results[target][moduleId] = { status: 'error', output: `Module "${moduleId}" not found` };
              continue;
            }
            const params = (session.params && session.params[moduleId]) || {};
            try {
              const modStartTime = Date.now();
              const result = await mod.run({ ...params, target }, {
                ...runOpts,
                onEvent: (event) => onEvent(moduleId, target, event)
              });
              const modElapsed = Date.now() - modStartTime;
              await this._updateModuleStat(moduleId, modElapsed);
              results[target][moduleId] = result;
            } catch (err) {
              results[target][moduleId] = { status: 'error', output: err.message };
            }
            await scanSessionService.update(session.id, { status: 'running', results });
          }
        }
      }
      
      await scanSessionService.update(session.id, { status: 'completed', results });

      try {
        const textToIngest = JSON.stringify(results, null, 2);
        if (textToIngest.length > 20) {
          getVectorService().ingest(session.id, textToIngest).catch(console.error);
        }
      } catch (err) {
        console.error('Failed to stringify or ingest scan results:', err.message);
      }
      
    } catch (err) {
      console.error('_executeTask caught error:', err);
      const currentSession = await scanSessionService.get(session.id);
      
      if (currentSession && currentSession.retryCount < currentSession.maxRetries) {
        const nextRetry = currentSession.retryCount + 1;
        await scanSessionService.update(session.id, { retry_count: nextRetry, error: `Retry ${nextRetry}/${currentSession.maxRetries}: ${err.message}` });
        
        // Auto-retry with backoff
        const backoffMs = 2000 * Math.pow(2, nextRetry - 1);
        setTimeout(() => {
          this.enqueue(currentSession, opts).catch(console.error);
        }, backoffMs);
      } else {
        await scanSessionService.update(session.id, { status: 'failed_permanent', error: err.message });
        const wsHub = getWsHandler();
        if (wsHub) {
          wsHub.broadcastToUser(session.userId, {
            type: 'SCAN_FAILED',
            data: { sessionId: session.id, message: err.message }
          });
        }
      }
    }
  }

  /**
   * Estimate the average execution time for a set of modules (sum of their averages).
   */
  async _estimateAvgTime(moduleIds = []) {
    const { ModuleExecStat } = getDb();
    let total = 0;
    for (const modId of moduleIds) {
      const stat = await ModuleExecStat.findByPk(modId);
      total += (stat && stat.avg_time_ms > 0) ? stat.avg_time_ms : 5000;
    }
    return total;
  }

  /**
   * 3.5: Migrate queued tasks from a failed runner to a replacement runner.
   * Called by RunnerService when a runner goes offline.
   */
  async migrateTasksFromRunner(oldRunnerId, newRunnerId) {
    const scanSessionService = getScanSessionService();
    let count = 0;
    for (const [userId, q] of this.userQueues.entries()) {
      for (const task of q) {
        if (task.session.runnerId === oldRunnerId) {
          task.session = { ...task.session, runnerId: newRunnerId };
          // Persist updated runnerId to DB
          await scanSessionService.update(task.session.id, { runnerId: newRunnerId }).catch(err => {
            console.error('Failed to persist runner migration:', err.message);
          });
          count++;
        }
      }
    }
    if (count > 0) {
      console.log(`[ExecutionQueueService] Migrated ${count} queued task(s) from runner ${oldRunnerId} → ${newRunnerId}`);
    }
    return count;
  }

  async _updateModuleStat(moduleId, elapsedMs) {
    try {
      const { ModuleExecStat } = getDb();
      const [stat, created] = await ModuleExecStat.findOrCreate({
        where: { module_id: moduleId },
        defaults: { avg_time_ms: elapsedMs, sample_count: 1 }
      });
      if (!created) {
        const newCount = stat.sample_count + 1;
        const newAvg = Math.floor(((stat.avg_time_ms * stat.sample_count) + elapsedMs) / newCount);
        await stat.update({ avg_time_ms: newAvg, sample_count: newCount });
      }
    } catch (e) {
      console.error('[ExecutionQueueService] Failed to update stats', e);
    }
  }

  getQueueStatus() {
    return {
      running: this.runningCount,
      queued: Array.from(this.userQueues.values()).reduce((acc, q) => acc + q.length, 0),
      maxConcurrent: this.maxConcurrent
    };
  }
}

let _instance = null;
function getExecutionQueueService() {
  if (!_instance) _instance = new ExecutionQueueService();
  return _instance;
}
function _resetExecutionQueueService() { _instance = null; }

module.exports = { getExecutionQueueService, ExecutionQueueService, _resetExecutionQueueService };
