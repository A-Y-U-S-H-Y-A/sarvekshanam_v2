'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');

const { getScanSessionService } = require('../services/scanSessionService');
const { getProxyService }       = require('../services/proxyService');

const checkRequiresApproval = (moduleIds, userRole) => {
  if (userRole === 'admin') return false;
  const registry = require('../modules/registry').getRegistry();
  for (const modId of (moduleIds || [])) {
    const mod = registry.getById(modId);
    if (mod && mod.meta && mod.meta.requires_strict_approval) {
      return true;
    }
  }
  return false;
};

// POST /api/scans — start a single scan
exports.createScan = asyncHandler(async (req, res, next) => {
    const { name, target, moduleIds, params = {}, runnerId, proxyConfig, appointmentId } = req.body;

    if (!target)                 return sendError(res, 'target is required');
    if (!moduleIds?.length)      return sendError(res, 'moduleIds array is required');
    if (!appointmentId)          return sendError(res, 'appointmentId is required');

    const needsApproval = checkRequiresApproval(moduleIds, req.user.role);

    const svc     = getScanSessionService();
    const session = await svc.create(req.user.id, { name, mode: 'single', targets: [target], moduleIds, params, runnerId, proxyConfig, appointmentId });

    if (needsApproval) {
      await svc.update(session.id, { status: 'pending_approval' });
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionId: session.id, moduleIds, user: req.user.username });
      return sendSuccess(res, { session, status: 'pending_approval', message: 'Admin approval required' }, 202);
    }

    // Run async (don't await — return sessionId immediately)
    const proxyService = getProxyService();
    setImmediate(() => svc.run(session.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message)));

    sendSuccess(res, { session }, 202);
  });

// POST /api/scans/bulk — bulk scan: N targets × M modules
exports.bulkScan = asyncHandler(async (req, res, next) => {
    const { name, targets, moduleIds, params = {}, runnerId, proxyConfig, appointmentId } = req.body;

    if (!targets?.length)   return sendError(res, 'targets array is required');
    if (!moduleIds?.length) return sendError(res, 'moduleIds array is required');
    if (!appointmentId)     return sendError(res, 'appointmentId is required');

    const needsApproval = checkRequiresApproval(moduleIds, req.user.role);

    const svc      = getScanSessionService();
    const sessions = await svc.bulkCreate(req.user.id, { name, targets, moduleIds, params, runnerId, proxyConfig, appointmentId });

    if (needsApproval) {
      for (const s of sessions) {
        await svc.update(s.id, { status: 'pending_approval' });
      }
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionIds: sessions.map(s => s.id), moduleIds, user: req.user.username });
      return sendSuccess(res, { sessions, count: sessions.length, status: 'pending_approval', message: 'Admin approval required' }, 202);
    }

    const proxyService = getProxyService();
    setImmediate(() => {
      for (const s of sessions) {
        svc.run(s.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message));
      }
    });

    sendSuccess(res, { sessions, count: sessions.length }, 202);
  });

// POST /api/scans/search or GET /api/scans — list user's sessions
exports.listScans = asyncHandler(async (req, res, next) => {
    const params = { ...req.query, ...req.body };
    const { page = 1, limit = 20, status, mode, appointmentId, grouped } = params;
    const svc    = getScanSessionService();
    let result;
    if (grouped === 'true' || grouped === true) {
      result = await svc.listGrouped(req.user.id, { page: parseInt(page, 10), limit: parseInt(limit, 10), status, mode, appointmentId });
    } else {
      result = await svc.list(req.user.id, { page: parseInt(page, 10), limit: parseInt(limit, 10), status, mode, appointmentId });
    }
    sendSuccess(res, result);
  });

// GET /api/scans/:id — get a session
exports.getScan = asyncHandler(async (req, res, next) => {
    const svc     = getScanSessionService();
    const session = await svc.get(req.params.id);
    if (!session) return sendNotFound(res, 'Session not found');
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Forbidden');
    }
    sendSuccess(res, { session });
  });

// DELETE /api/scans/:id — cancel / delete session
exports.deleteScan = asyncHandler(async (req, res, next) => {
    const svc     = getScanSessionService();
    const session = await svc.get(req.params.id);
    if (!session) return sendNotFound(res, 'Session not found');
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Forbidden');
    }
    await svc.delete(req.params.id);
    sendSuccess(res, { message: 'Session deleted' });
  });

// POST /api/scans/:id/retry — retry a failed scan
exports.retryScan = asyncHandler(async (req, res, next) => {
    const svc = getScanSessionService();
    let session = await svc.get(req.params.id);
    if (!session) return sendNotFound(res, 'Session not found');
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Forbidden');
    }
    
    // Only allow retry on failed or completed sessions
    if (!['failed', 'completed', 'failed_permanent'].includes(session.status)) {
      return res.status(400).json({ success: false, error: { message: `Cannot retry session in status: ${session.status}` } });
    }

    const needsApproval = checkRequiresApproval(session.moduleIds, req.user.role);

    if (needsApproval) {
      session = await svc.update(session.id, { status: 'pending_approval' });
      const { getWsHandler } = require('../ws/wsHandler');
      getWsHandler().broadcastAll({ type: 'ADMIN_APPROVAL_REQUIRED', sessionId: session.id, moduleIds: session.moduleIds, user: req.user.username });
      return sendSuccess(res, { session, status: 'pending_approval', message: 'Admin approval required' }, 202);
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
    
    sendSuccess(res, { session }, 202);
  });

// POST /api/scans/:id/approve — approve a strict scan
exports.approveScan = asyncHandler(async (req, res, next) => {
    if (req.user.role !== 'admin') {
      return sendForbidden(res, 'Only admins can approve strict scans');
    }

    const svc = getScanSessionService();
    let session = await svc.get(req.params.id);
    if (!session) return sendNotFound(res, 'Session not found');

    if (session.status !== 'pending_approval') {
      return res.status(400).json({ success: false, error: { message: `Session is not pending approval (status: ${session.status})` } });
    }

    session = await svc.update(session.id, { status: 'pending' });

    const proxyService = getProxyService();
    setImmediate(() => svc.run(session.id, { proxyEnv: proxyService.getExecEnv() }).catch(err => console.error('[ScanController] Background scan execution failed:', err.message)));

    sendSuccess(res, { session }, 202);
  });




exports.exportScan = asyncHandler(async (req, res, next) => {
    const svc = getScanSessionService();
    const session = await svc.get(req.params.id);
    if (!session) return sendNotFound(res, 'Session not found');
    if (session.userId !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Forbidden');
    }
    
    const filename = `scan-${session.id}.json`;
    res.setHeader('Content-disposition', 'attachment; filename=' + filename);
    res.setHeader('Content-type', 'application/json');
    res.send(JSON.stringify(session, null, 2));
  });

exports.exportGroup = asyncHandler(async (req, res, next) => {
    const svc = getScanSessionService();
    const sessions = await svc.getByGroupId(req.params.groupId);
    if (!sessions || sessions.length === 0) return sendNotFound(res, 'Group not found');
    
    if (sessions[0].userId !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Forbidden');
    }
    
    const format = req.query.format || 'json';
    const groupName = sessions[0].name || sessions[0].groupId || 'group';
    const safeName = groupName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    
    if (format === 'json') {
      res.setHeader('Content-disposition', `attachment; filename=group-${safeName}.json`);
      res.setHeader('Content-type', 'application/json');
      res.write('[\n');
      for (let i = 0; i < sessions.length; i++) {
        res.write(JSON.stringify(sessions[i], null, 2));
        if (i < sessions.length - 1) res.write(',\n');
      }
      res.write('\n]');
      return res.end();
    }
    
    if (format === 'json-zip') {
      const { ZipArchive } = require('archiver');
      const archive = new ZipArchive({ zlib: { level: 9 } });
      res.setHeader('Content-disposition', `attachment; filename=group-${safeName}.zip`);
      res.setHeader('Content-type', 'application/zip');
      
      archive.on('error', (err) => next(err));
      archive.pipe(res);
      
      sessions.forEach(s => {
        archive.append(JSON.stringify(s, null, 2), { name: `scan-${s.id}.json` });
      });
      
      return archive.finalize();
    }
    
    // Flatten data for CSV/XLSX
    const rows = sessions.map(s => {
      const flat = {
        SessionID: s.id,
        Name: s.name,
        Status: s.status,
        Mode: s.mode,
        CreatedAt: s.createdAt,
        RunnerID: s.runnerId || s.runner_id || '',
        RetryCount: s.retryCount || s.retry_count || 0,
        Targets: Array.isArray(s.targets) ? s.targets.join(', ') : s.targets,
        Modules: Array.isArray(s.moduleIds) ? s.moduleIds.join(', ') : s.moduleIds,
        Params: typeof s.params === 'object' ? JSON.stringify(s.params) : s.params,
        Error: s.error || ''
      };
      
      if (s.results) {
        flat.Results = JSON.stringify(s.results);
      }
      return flat;
    });
    
    const headerSet = new Set();
    rows.forEach(r => Object.keys(r).forEach(k => headerSet.add(k)));
    const headers = Array.from(headerSet);
    
    if (format === 'csv') {
      const { stringify } = require('csv-stringify/sync');
      const csvStr = stringify(rows, { header: true, columns: headers });
      res.setHeader('Content-disposition', `attachment; filename=group-${safeName}.csv`);
      res.setHeader('Content-type', 'text/csv');
      res.write(csvStr);
      return res.end();
    }
    
    if (format === 'xlsx') {
      const writeXlsxFile = require('write-excel-file/node');
      const data = [];
      if (headers.length > 0) {
        data.push(headers.map(h => ({ type: String, value: String(h), fontWeight: 'bold' })));
        for (const row of rows) {
          data.push(headers.map(h => {
             let val = row[h];
             if (val == null) return { type: String, value: '' };
             if (typeof val === 'number') return { type: Number, value: val };
             if (typeof val === 'boolean') return { type: Boolean, value: val };
             return { type: String, value: String(val) };
          }));
        }
      } else {
        data.push([{ type: String, value: 'Empty', fontWeight: 'bold' }]);
      }
      const buf = await writeXlsxFile(data).toBuffer();
      res.setHeader('Content-disposition', `attachment; filename=group-${safeName}.xlsx`);
      res.setHeader('Content-type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      return res.end(buf);
    }
    
    sendError(res, 'Invalid format requested');
  });

