'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { getDb } = require('../db/database');
const { getJwksManager }  = require('../auth/jwks');
const { getCryptoService } = require('./cryptoService');
const registryModule = require('../modules/registry');
const RemoteModule = require('../modules/base/RemoteModule');

class RunnerService {
  constructor() {
    this._pollingStarted = false;
    this.runnerTimers = new Map();
    this.runnerFailures = new Map();
    /** @type {Map<string, number>} runner id → exponential moving avg response time (ms) */
    this.runnerResponseAvg = new Map();
    /** @type {Map<string, boolean>} runner id → supports /run-bulk */
    this.runnerBulkSupport = new Map();
  }

  async getRunners() {
    const { RemoteHost, SlaveGroupMember, SlaveGroup } = getDb();
    const rows = await RemoteHost.findAll({
      include: [{
        model: SlaveGroupMember,
        as: 'group_memberships',
        include: [{ model: SlaveGroup, as: 'group' }]
      }]
    });
    return rows.map(r => {
      let groupName = null;
      if (r.group_memberships && r.group_memberships.length > 0) {
        groupName = r.group_memberships[0].group.name;
      }
      return {
        id: r.id,
        name: r.name,
        url: r.url,
        status: r.status,
        last_seen_at: r.last_seen_at,
        modules: JSON.parse(r.modules_json || '[]'),
        group: groupName
      };
    });
  }

  async getRunnerById(id) {
    const { RemoteHost } = getDb();
    const row = await RemoteHost.findByPk(id);
    if (!row) return null;
    return {
      id: row.id,
      name: row.name,
      url: row.url,
      status: row.status,
      last_seen_at: row.last_seen_at,
      modules: JSON.parse(row.modules_json || '[]'),
      _raw_modules_json: row.modules_json || '[]'
    };
  }

  async createRunner({ name, url }) {
    const { RemoteHost } = getDb();
    const id = crypto.randomUUID();
    await RemoteHost.create({ id, name, url });
    
    // Schedule poll immediately
    this._schedulePoll(id, 0);
    return this.getRunnerById(id);
  }

  async updateRunner(id, { name, url }) {
    const { RemoteHost } = getDb();
    const updates = {};
    if (name) updates.name = name;
    if (url) updates.url = url;
    
    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date();
      await RemoteHost.update(updates, { where: { id } });
      this._schedulePoll(id, 0);
    }
    return this.getRunnerById(id);
  }

  async deleteRunner(id) {
    const { RemoteHost } = getDb();
    await RemoteHost.destroy({ where: { id } });
    // Evict cached public key
    getCryptoService().evictPublicKey(id);
  }

  /**
   * Build authorization headers for a slave request.
   * Prefers JWKS-signed JWT; falls back to PSK if present.
   */
  _getAuthHeaders(runner) {
    const headers = { 'Content-Type': 'application/json' };
    try {
      const jwks = getJwksManager();
      const token = jwks.signSlaveToken({ runnerId: runner.id, action: 'execute' });
      headers['Authorization'] = `Bearer ${token}`;
    } catch (_jwksErr) {
      console.warn('JWKS signing failed, slave will operate in dev mode:', _jwksErr.message);
      // JWKS signing failed — slave will operate in dev mode (unauthenticated)
    }
    return headers;
  }

  async runModuleOnHost(runnerId, moduleName, args = [], onEvent = null) {
    const runner = await this.getRunnerById(runnerId);
    if (!runner) throw new Error('Runner not found');

    try {
      // Encrypt sensitive params if we have the slave's public key
      let body = { module: moduleName, args };
      const cryptoSvc = getCryptoService();
      const pubKey = cryptoSvc.getPublicKey(runnerId);
      if (pubKey && args.length > 0) {
        try {
          body.encrypted_args = cryptoSvc.encryptForSlave(runnerId, JSON.stringify(args));
          delete body.args;
        } catch (_encryptErr) {
          console.warn('Failed to encrypt args for slave, sending plaintext:', _encryptErr.message);
          // Encryption failed — send plaintext
        }
      }

      const response = await fetch(`${runner.url}/run`, {
        method: 'POST',
        headers: this._getAuthHeaders(runner),
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        throw new Error(`Runner returned status: ${response.status}`);
      }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        let stdout = '';
        let stderr = '';
        let finalExitCode = 0;
        let finalError = '';
        let sandboxId = '';
        let generatedFiles = [];

        const reader = response.body.getReader();
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
                  stdout += (event.line !== undefined ? event.line : '') + '\n';
                } else if (event.type === 'stderr') {
                  stderr += (event.line !== undefined ? event.line : '') + '\n';
                } else if (event.type === 'error') {
                  finalError = event.error;
                } else if (event.type === 'done') {
                  finalExitCode = event.exit_code || 0;
                  if (event.sandbox_id) sandboxId = event.sandbox_id;
                  if (event.files) generatedFiles = event.files;
                }
                
                if (onEvent) onEvent(event);
                
              } catch (e) {
                console.error('[RunnerService] Failed to parse SSE event:', e, line);
              }
            }
          }
        }
        
        const result = { stdout, stderr };
        if (finalExitCode !== 0 || finalError) {
          result.error = finalError || `Process exited with code ${finalExitCode}`;
        }
        
        if (sandboxId && generatedFiles.length > 0) {
          result.files = await this._downloadFiles(runner, sandboxId, generatedFiles);
        }

        return result;

      } else {
        // Fallback for older JSON responses
        const rawText = await response.text();
        try {
          return JSON.parse(rawText);
        } catch(e) {
          return { error: 'Failed to parse JSON response from runner', raw: rawText };
        }
      }
    } catch (err) {
      throw new Error(`Remote execution failed: ${err.message}`);
    }
  }

  startPolling() {
    if (this._pollingStarted) return;
    this._pollingStarted = true;
    setTimeout(() => this._pollAllRunners(), 2000);
  }

  stopPolling() {
    this._pollingStarted = false;
    for (const timer of this.runnerTimers.values()) {
      clearTimeout(timer);
    }
    this.runnerTimers.clear();
  }

  async _pollAllRunners() {
    if (!this._pollingStarted) return;
    const { RemoteHost } = getDb();
    const runners = await RemoteHost.findAll({ attributes: ['id'] });
    for (const { id } of runners) {
      if (!this.runnerTimers.has(id)) {
        this._schedulePoll(id, 0);
      }
    }
  }

  _schedulePoll(id, delayMs) {
    if (!this._pollingStarted) return;
    if (this.runnerTimers.has(id)) {
      clearTimeout(this.runnerTimers.get(id));
    }
    const timer = setTimeout(() => {
      const t0 = Date.now();
      this._pollRunner(id).catch(console.error).finally(() => {
        if (!this._pollingStarted) return;
        const elapsed = Date.now() - t0;

        // 3.4 Adaptive polling: EMA of response time, clamp 10s–60s
        const prevAvg = this.runnerResponseAvg.get(id) || elapsed;
        const newAvg = Math.round(0.7 * prevAvg + 0.3 * elapsed);
        this.runnerResponseAvg.set(id, newAvg);

        const failCount = this.runnerFailures.get(id) || 0;
        let nextDelay;
        if (failCount > 0) {
          nextDelay = Math.min(300000, 30000 * Math.pow(2, failCount));
        } else {
          // Adaptive: 1.5× avg response, clamped 10s–60s
          nextDelay = Math.max(10000, Math.min(60000, Math.round(1.5 * newAvg)));
        }
        this._schedulePoll(id, nextDelay);
      });
    }, delayMs);
    this.runnerTimers.set(id, timer);
  }

  _computeManifestHash(modulesJson) {
    try {
      const parsed = JSON.parse(modulesJson);
      if (!Array.isArray(parsed)) return crypto.createHash('sha256').update('[]').digest('hex');
      const sorted = parsed.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
      const normalized = JSON.stringify(sorted);
      return crypto.createHash('sha256').update(normalized).digest('hex');
    } catch (hashErr) {
      console.warn('Failed to compute manifest hash:', hashErr.message);
      return crypto.createHash('sha256').update('[]').digest('hex');
    }
  }

  async _pollRunner(id) {
    const runner = await this.getRunnerById(id);
    if (!runner) return;

    const prevStatus = runner.status;
    const prevModulesJson = runner._raw_modules_json;

    let isOnline = false;
    let modulesJson = '[]';

    try {
      const resp = await fetch(`${runner.url}/modules`, {
        headers: this._getAuthHeaders(runner)
      });
      if (resp.ok) {
        isOnline = true;
        this.runnerFailures.set(id, 0);
        const modules = await resp.json();
        modulesJson = JSON.stringify(modules);
      } else {
        throw new Error(`Not OK: ${resp.status} - ${await resp.text()}`);
      }
    } catch (err) {
      isOnline = false;
      const failCount = this.runnerFailures.get(id) || 0;
      console.error(`[RunnerService] fetch failed for ${runner.url}/modules:`, err.message);
      this.runnerFailures.set(id, failCount + 1);
    }

    // Fetch and cache slave's public key for asymmetric encryption
    if (isOnline) {
      try {
        const pkResp = await fetch(`${runner.url}/pubkey`, {
          headers: this._getAuthHeaders(runner)
        });
        if (pkResp.ok) {
          const pemKey = await pkResp.text();
          getCryptoService().cachePublicKey(id, pemKey.trim());
        }
      } catch (_pubkeyErr) {
        // Slave doesn't support /pubkey yet — fine
      }
    }

    const status = isOnline ? 'online' : 'offline';
    const { RemoteHost, SlaveGroup, SlaveGroupMember } = getDb();

    // 3.5 Heartbeat: check if runner was previously online but last_seen_at > 60s
    if (!isOnline) {
      const previouslyOnline = runner.status === 'online';
      const lastSeenMs = runner.last_seen_at ? new Date(runner.last_seen_at).getTime() : 0;
      const secondsSinceLastSeen = (Date.now() - lastSeenMs) / 1000;
      if (previouslyOnline || secondsSinceLastSeen > 60) {
        // Explicitly ensure status is persisted as offline
        await RemoteHost.update({
          status: 'offline',
          modules_json: modulesJson,
          updated_at: new Date()
        }, { where: { id } });
        // 3.5 Task migration: try to move queued tasks to another runner in the same group
        await this._migrateQueuedTasks(id);
      } else {
        await RemoteHost.update({
          status,
          modules_json: modulesJson,
          updated_at: new Date()
        }, { where: { id } });
      }
    } else {
      await RemoteHost.update({
        status,
        modules_json: modulesJson,
        last_seen_at: new Date(),
        updated_at: new Date()
      }, { where: { id } });
    }

    if (isOnline) {
      try {
        const manifestHash = this._computeManifestHash(modulesJson);
        let group = await SlaveGroup.findOne({ where: { manifest_hash: manifestHash } });
        if (!group) {
          group = await SlaveGroup.create({
            id: crypto.randomUUID(),
            name: `Group-${manifestHash.substring(0, 8)}`,
            manifest_hash: manifestHash
          });
        }
        
        const existingMembership = await SlaveGroupMember.findOne({ where: { runner_id: id }, paranoid: false });
        if (existingMembership) {
          if (existingMembership.group_id !== group.id || existingMembership.deleted_at !== null) {
            existingMembership.group_id = group.id;
            existingMembership.deleted_at = null;
            await existingMembership.save({ paranoid: false });
          }
        } else {
          await SlaveGroupMember.create({ group_id: group.id, runner_id: id });
        }
      } catch (e) {
        console.error('[RunnerService] Failed to assign slave group for runner %s:', id, e);
      }
    }

    // Sync parsed modules to the live ModuleRegistry
    const registry = registryModule.getRegistry();

    registry.unregisterDynamicByRunner(id);
    if (isOnline) {
      try {
        const parsedModules = JSON.parse(modulesJson);
        for (const mod of parsedModules) {
          registry.registerDynamic(new RemoteModule(runner, mod));
        }
      } catch (e) {
        console.error('[RunnerService] Failed to sync dynamic modules for runner %s:', id, e);
      }
    }

    if (status !== prevStatus || modulesJson !== prevModulesJson) {
      const { getWsHandler } = require('../ws/wsHandler');
      const wsHandler = getWsHandler();
      if (wsHandler) {
        wsHandler.broadcastAll({ type: 'MODULES_UPDATE' });
      }
    }
  }

  // ── 3.6: Bulk Delegation ──────────────────────────────────────────────────

  runnerSupportsBulk(id) {
    if (!this.runnerBulkSupport.has(id)) {
      this.runnerBulkSupport.set(id, true); // Opt-in by default until it fails
    }
    return this.runnerBulkSupport.get(id);
  }

  markBulkUnsupported(id) {
    console.log(`[RunnerService] Marking runner ${id} as NOT supporting /run-bulk`);
    this.runnerBulkSupport.set(id, false);
  }

  async runBulkOnHost(runnerId, moduleName, targets, args = [], onEvent = null) {
    const runner = await this.getRunnerById(runnerId);
    if (!runner) throw new Error('Runner not found');

    let body = { module: moduleName, targets, args };
    const cryptoSvc = getCryptoService();
    const pubKey = cryptoSvc.getPublicKey(runnerId);
    if (pubKey && args.length > 0) {
      try {
        body.encrypted_args = cryptoSvc.encryptForSlave(runnerId, JSON.stringify(args));
        delete body.args;
      } catch (_encryptErr) { console.warn('Failed to encrypt bulk args for slave, sending plaintext:', _encryptErr.message); }
    }

    const response = await fetch(`${runner.url}/run-bulk`, {
      method: 'POST',
      headers: this._getAuthHeaders(runner),
      body: JSON.stringify(body)
    });

    if (response.status === 404 || response.status === 405) {
      this.markBulkUnsupported(runnerId);
      throw new Error('Endpoint /run-bulk not supported');
    }
    if (!response.ok) {
      throw new Error(`Runner returned status: ${response.status}`);
    }

      const contentType = response.headers.get('content-type') || '';
      if (contentType.includes('text/event-stream')) {
        const resultsByTarget = {};
        for (const t of targets) {
          resultsByTarget[t] = { target: t, stdout: '', stderr: '', exitCode: 0, error: '', files: [], sandboxId: '' };
        }

      const reader = response.body.getReader();
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
              
              const tgt = event.target;
              if (!tgt || !resultsByTarget[tgt]) continue;

              if (event.type === 'stdout') {
                resultsByTarget[tgt].stdout += (event.line !== undefined ? event.line : '') + '\n';
              } else if (event.type === 'stderr') {
                resultsByTarget[tgt].stderr += (event.line !== undefined ? event.line : '') + '\n';
              } else if (event.type === 'error') {
                resultsByTarget[tgt].error = event.error;
              } else if (event.type === 'done') {
                resultsByTarget[tgt].exitCode = event.exit_code || 0;
                if (event.sandbox_id) resultsByTarget[tgt].sandboxId = event.sandbox_id;
                if (event.files) resultsByTarget[tgt].files = event.files;
              }

              if (onEvent) onEvent(event);
            } catch (e) {
              console.error('[RunnerService] Failed to parse bulk SSE event:', e, line);
            }
          }
        }
      }

      // Convert map to array and format errors
      const results = Object.values(resultsByTarget);
      for (const res of results) {
        if (res.exitCode !== 0 && !res.error) res.error = `Process exited with code ${res.exitCode}`;
        delete res.exitCode;
        if (res.sandboxId && res.files && res.files.length > 0) {
          res.downloadedFiles = await this._downloadFiles(runner, res.sandboxId, res.files);
        }
        delete res.sandboxId;
        delete res.files;
      }
      return results;

    } else {
      const rawText = await response.text();
      try {
        return JSON.parse(rawText);
      } catch(e) {
        throw new Error(`Failed to parse JSON response from runner /run-bulk: ${rawText}`);
      }
    }
  }

  async _downloadFiles(runner, sandboxId, files) {
    const downloaded = [];
    const uploadDir = path.join(__dirname, '..', '..', 'uploads', runner.id, sandboxId);
    
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }

    for (const f of files) {
      try {
        const fetchRes = await fetch(`${runner.url}/files/${sandboxId}/${f.name}`, {
          headers: this._getAuthHeaders(runner)
        });
        if (fetchRes.ok) {
          const localPath = path.join(uploadDir, f.name);
          const arrayBuffer = await fetchRes.arrayBuffer();
          fs.writeFileSync(localPath, Buffer.from(arrayBuffer));
          downloaded.push(localPath);
        }
      } catch (err) {
        console.error(`[RunnerService] Failed to download file ${f.name} from sandbox ${sandboxId}:`, err);
      }
    }
    return downloaded;
  }

  // ── 3.5: Task Migration ───────────────────────────────────────────────────

  async _migrateQueuedTasks(offlineRunnerId) {
    const { getExecutionQueueService } = require('./executionQueueService');
    const { RemoteHost, SlaveGroupMember } = getDb();

    // Find what group the offline runner was in
    const member = await SlaveGroupMember.findOne({ where: { runner_id: offlineRunnerId } });
    if (!member) return; // Wasn't in a group, can't migrate

    // Find another ONLINE runner in the SAME group
    const peers = await SlaveGroupMember.findAll({
      where: { group_id: member.group_id },
      include: [{ model: RemoteHost, as: 'runner', where: { status: 'online' } }]
    });

    const onlinePeers = peers.map(p => p.runner).filter(r => r.id !== offlineRunnerId);
    if (onlinePeers.length === 0) {
      console.log(`[RunnerService] No online peers in group ${member.group_id} to migrate tasks from ${offlineRunnerId}`);
      return;
    }

    // Pick a random online peer
    const targetRunner = onlinePeers[Math.floor(Math.random() * onlinePeers.length)];
    
    // Migrate tasks
    const queueSvc = getExecutionQueueService();
    await queueSvc.migrateTasksFromRunner(offlineRunnerId, targetRunner.id);
  }
}

// ── Singleton ─────────────────────────────────────────────────────────────────

let _instance = null;
function getRunnerService() {
  if (!_instance) _instance = new RunnerService();
  return _instance;
}

module.exports = { getRunnerService, RunnerService };
