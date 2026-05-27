'use strict';

const scanController = require('../../src/controllers/scanController');

const mockScanSvc = {
  create: jest.fn(),
  bulkCreate: jest.fn(),
  list: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  run: jest.fn().mockResolvedValue()
};

const mockProxySvc = {
  getExecEnv: jest.fn().mockReturnValue({})
};

jest.mock('../../src/services/scanSessionService', () => ({
  getScanSessionService: () => mockScanSvc
}));

jest.mock('../../src/services/proxyService', () => ({
  getProxyService: () => mockProxySvc
}));

jest.mock('../../src/modules/registry', () => ({
  getRegistry: () => ({
    getById: jest.fn().mockReturnValue(null)
  })
}));

describe('scanController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, user: { id: 'u1', role: 'viewer', username: 'alice' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
    mockScanSvc.run.mockResolvedValue();
    mockProxySvc.getExecEnv.mockReturnValue({});
  });

  describe('createScan', () => {
    it('returns 400 if target missing', async () => {
      await scanController.createScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
    });

    it('returns 400 if moduleIds missing', async () => {
      req.body = { target: 't1' };
      await scanController.createScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('creates session and returns 202', async () => {
      req.body = { target: 't1', moduleIds: ['m1'] };
      mockScanSvc.create.mockResolvedValue({ id: 's1', status: 'pending' });

      await scanController.createScan(req, res, next);

      expect(mockScanSvc.create).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('bulkScan', () => {
    it('returns 400 if targets missing', async () => {
      await scanController.bulkScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 if moduleIds missing', async () => {
      req.body = { targets: ['t1'] };
      await scanController.bulkScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('creates bulk sessions and returns 202', async () => {
      req.body = { targets: ['t1', 't2'], moduleIds: ['m1'] };
      mockScanSvc.bulkCreate.mockResolvedValue([{ id: 's1' }, { id: 's2' }]);

      await scanController.bulkScan(req, res, next);

      expect(mockScanSvc.bulkCreate).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('listScans', () => {
    it('lists sessions for user', async () => {
      mockScanSvc.list.mockResolvedValue({ sessions: [], total: 0 });

      await scanController.listScans(req, res, next);

      expect(mockScanSvc.list).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getScan', () => {
    it('returns 404 if session not found', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue(null);

      await scanController.getScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 if user does not own session', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u2' });

      await scanController.getScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns session if owner', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u1', id: 's1' });

      await scanController.getScan(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });

    it('allows admin to view any session', async () => {
      req.user.role = 'admin';
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u2', id: 's1' });

      await scanController.getScan(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('deleteScan', () => {
    it('returns 404 if session not found', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue(null);

      await scanController.deleteScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('deletes session and returns 200', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u1' });

      await scanController.deleteScan(req, res, next);

      expect(mockScanSvc.delete).toHaveBeenCalledWith('s1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('retryScan', () => {
    it('returns 404 if session not found', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue(null);

      await scanController.retryScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 400 if session is not in a retryable state', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u1', status: 'running' });

      await scanController.retryScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('resets and re-runs a failed session', async () => {
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u1', id: 's1', status: 'failed' });
      mockScanSvc.update.mockResolvedValue({ id: 's1', status: 'pending' });

      await scanController.retryScan(req, res, next);

      expect(mockScanSvc.update).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('approveScan', () => {
    it('returns 403 if not admin', async () => {
      req.user.role = 'viewer';
      await scanController.approveScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns 404 if session not found', async () => {
      req.user.role = 'admin';
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue(null);

      await scanController.approveScan(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('approves and re-runs a pending_approval session', async () => {
      req.user.role = 'admin';
      req.params.id = 's1';
      mockScanSvc.get.mockResolvedValue({ userId: 'u1', id: 's1', status: 'pending_approval' });
      mockScanSvc.update.mockResolvedValue({ id: 's1', status: 'pending' });

      await scanController.approveScan(req, res, next);

      expect(mockScanSvc.update).toHaveBeenCalledWith('s1', { status: 'pending' });
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });
});
