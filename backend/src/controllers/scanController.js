'use strict';

const { getScanSessionService } = require('../services/scanSessionService');
const { getProxyService }       = require('../services/proxyService');

// POST /api/scans — start a single scan
exports.createScan = async (req, res, next) => {
  try {
    const { name, target, moduleIds, params = {}, runnerId, proxyConfig, appointmentId } = req.body;

    if (!target)                 return res.status(400).json({ success: false, error: { message: 'target is required' } });
    if (!moduleIds?.length)      return res.status(400).json({ success: false, error: { message: 'moduleIds array is required' } });
    if (!appointmentId)          return res.status(400).json({ success: false, error: { message: 'appointmentId is required' } });

    const registry = require('../modules/registry').getRegistry();
    let needsApproval = false;
    for (const modId of moduleIds) {
      const mod = registry.getById(modId);
      if (mod && mod.meta.requires_strict_approval && req.user.role !== 'admin') {
        needsApproval = true;
      }
    }

    const svc     = getScanSessionService();
    const session = await svc.create(req.user.id, { name, mode: 'single', targets: [target], moduleIds, params, runnerId, proxyConfig, appointmentId });

    if (needsApproval) {
      await svc.update(session.id, { status: 'pending_approval' });
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionId: session.id, moduleIds, user: req.user.username });
      return res.status(202).json({ success: true, data: { session, status: 'pending_approval', message: 'Admin approval required' } });
    }

    // Run async (don't await — return sessionId immediately)
    const proxyService = getProxyService();
    setImmediate(() => svc.run(session.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message)));

    res.status(202).json({ success: true, data: { session } });
  } catch (err) {
    next(err);
  }
};

// POST /api/scans/bulk — bulk scan: N targets × M modules
exports.bulkScan = async (req, res, next) => {
  try {
    const { name, targets, moduleIds, params = {}, runnerId, proxyConfig, appointmentId } = req.body;

    if (!targets?.length)   return res.status(400).json({ success: false, error: { message: 'targets array is required' } });
    if (!moduleIds?.length) return res.status(400).json({ success: false, error: { message: 'moduleIds array is required' } });
    if (!appointmentId)     return res.status(400).json({ success: false, error: { message: 'appointmentId is required' } });

    const registry = require('../modules/registry').getRegistry();
    let needsApproval = false;
    for (const modId of moduleIds) {
      const mod = registry.getById(modId);
      if (mod && mod.meta.requires_strict_approval && req.user.role !== 'admin') {
        needsApproval = true;
      }
    }

    const svc      = getScanSessionService();
    const sessions = await svc.bulkCreate(req.user.id, { name, targets, moduleIds, params, runnerId, proxyConfig, appointmentId });

    if (needsApproval) {
      for (const s of sessions) {
        await svc.update(s.id, { status: 'pending_approval' });
      }
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionIds: sessions.map(s => s.id), moduleIds, user: req.user.username });
      return res.status(202).json({ success: true, data: { sessions, count: sessions.length, status: 'pending_approval', message: 'Admin approval required' } });
    }

    const proxyService = getProxyService();
    setImmediate(() => {
      for (const s of sessions) {
        svc.run(s.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message));
      }
    });

    res.status(202).json({ success: true, data: { sessions, count: sessions.length } });
  } catch (err) {
    next(err);
  }
};

// POST /api/scans/search or GET /api/scans — list user's sessions
exports.listScans = async (req, res, next) => {
  try {
    const params = { ...req.query, ...req.body };
    const { page = 1, limit = 20, status, appointmentId } = params;
    const svc    = getScanSessionService();
    const result = await svc.list(req.user.id, { page: parseInt(page, 10), limit: parseInt(limit, 10), status, appointmentId });
    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

// GET /api/scans/:id — get a session
exports.getScan = async (req, res, next) => {
  try {
    const svc     = getScanSessionService();
    const session = await svc.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    res.json({ success: true, data: { session } });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/scans/:id — cancel / delete session
exports.deleteScan = async (req, res, next) => {
  try {
    const svc     = getScanSessionService();
    const session = await svc.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    await svc.delete(req.params.id);
    res.json({ success: true, data: { message: 'Session deleted' } });
  } catch (err) {
    next(err);
  }
};

// POST /api/scans/:id/retry — retry a failed scan
exports.retryScan = async (req, res, next) => {
  try {
    const svc = getScanSessionService();
    let session = await svc.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Forbidden' } });
    }
    
    // Only allow retry on failed or completed sessions
    if (!['failed', 'completed', 'failed_permanent'].includes(session.status)) {
      return res.status(400).json({ success: false, error: { message: `Cannot retry session in status: ${session.status}` } });
    }

    const registry = require('../modules/registry').getRegistry();
    let needsApproval = false;
    for (const modId of (session.moduleIds || [])) {
      const mod = registry.getById(modId);
      if (mod && mod.meta && mod.meta.requires_strict_approval && req.user.role !== 'admin') {
        needsApproval = true;
      }
    }

    if (needsApproval) {
      session = await svc.update(session.id, { status: 'pending_approval' });
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionId: session.id, moduleIds: session.moduleIds, user: req.user.username });
      return res.status(202).json({ success: true, data: { session, status: 'pending_approval', message: 'Admin approval required' } });
    }

    const { runnerId, proxyConfig } = req.body;
    let patch = { 
      status: 'pending', 
      error: null, 
      result_json: null 
    };

    if (runnerId !== undefined)    patch.runnerId = runnerId;
    if (proxyConfig !== undefined) patch.proxyConfig = proxyConfig;

    session = await svc.update(session.id, patch);

    const proxyService = getProxyService();
    setImmediate(() => svc.run(session.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message)));
    
    res.status(202).json({ success: true, data: { session } });
  } catch (err) {
    next(err);
  }
};

// POST /api/scans/:id/approve — approve a strict scan
exports.approveScan = async (req, res, next) => {
  try {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Only admins can approve strict scans' } });
    }

    const svc = getScanSessionService();
    let session = await svc.get(req.params.id);
    if (!session) return res.status(404).json({ success: false, error: { message: 'Session not found' } });

    if (session.status !== 'pending_approval') {
      return res.status(400).json({ success: false, error: { message: `Session is not pending approval (status: ${session.status})` } });
    }

    session = await svc.update(session.id, { status: 'pending' });

    const proxyService = getProxyService();
    setImmediate(() => svc.run(session.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message)));

    res.status(202).json({ success: true, data: { session } });
  } catch (err) {
    next(err);
  }
};
