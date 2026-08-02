const scanController = require('../../src/controllers/scanController');

jest.mock('../../src/services/scanSessionService', () => {
  const mockSvc = {
    list: jest.fn(),
    get: jest.fn(),
    getByGroupId: jest.fn(),
    create: jest.fn(),
    createBulk: jest.fn(),
    delete: jest.fn(),
    updateStatus: jest.fn(),
    update: jest.fn(),
    enqueueScan: jest.fn(),
    enqueueBulk: jest.fn(),
    run: jest.fn().mockResolvedValue(),
    stop: jest.fn().mockResolvedValue(true)
  };
  return {
    getScanSessionService: jest.fn().mockReturnValue(mockSvc),
    mockSvc
  };
});

jest.mock('../../src/services/proxyService', () => ({
  getProxyService: jest.fn().mockReturnValue({
    getRules: jest.fn().mockResolvedValue([]),
    getExecEnv: jest.fn().mockReturnValue({})
  })
}));

jest.mock('../../src/services/commandService', () => ({
  getCommandService: jest.fn().mockReturnValue({
    approve: jest.fn().mockResolvedValue(true)
  })
}));

describe('ScanController Unit Tests', () => {
  let req, res, next, mockSvc;

  beforeEach(() => {
    mockSvc = require('../../src/services/scanSessionService').mockSvc;
    req = { user: { id: 1, role: 'admin', username: 'admin' }, body: {}, params: {}, query: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn(),
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('createScan', () => {
    it('creates scan', async () => {
      req.body = { target: '127.0.0.1', moduleIds: ['mod1'], appointmentId: 1 };
      mockSvc.create.mockResolvedValue({ id: 's1' });
      await scanController.createScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('bulkScan', () => {
    it('creates bulk scan', async () => {
      req.body = { targets: ['127.0.0.1'], moduleIds: ['mod1'], appointmentId: 1 };
      mockSvc.bulkCreate = jest.fn().mockResolvedValue([{ id: 's1' }]);
      await scanController.bulkScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(202);
    });
  });

  describe('listScans', () => {
    it('lists scans', async () => {
      req.query = { appointmentId: 1 };
      mockSvc.list.mockResolvedValue({ data: [] });
      await scanController.listScans(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getScan', () => {
    it('gets scan', async () => {
      req.params = { id: 's1' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1 });
      await scanController.getScan(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('deleteScan', () => {
    it('deletes scan', async () => {
      req.params = { id: 's1' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1 });
      await scanController.deleteScan(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('retryScan', () => {
    it('retries failed scan', async () => {
      req.params = { id: 's1' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1, status: 'failed', moduleIds: [] });
      mockSvc.update.mockResolvedValue({ id: 's1' });
      await scanController.retryScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(202);
    });
    
    it('returns 400 if not failed or completed', async () => {
      req.params = { id: 's1' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1, status: 'pending', moduleIds: [] });
      await scanController.retryScan(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('approveScan', () => {
    it('approves scan', async () => {
      req.params = { id: 's1' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1, status: 'pending_approval' });
      await scanController.approveScan(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('exportScan', () => {
    it('exports scan as csv', async () => {
      req.params = { id: 's1' };
      req.query = { format: 'csv' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1, results: { vulns: [{ title: 'XSS' }] } });
      await scanController.exportScan(req, res, next);
      expect(res.setHeader).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });
    
    it('exports scan as json', async () => {
      req.params = { id: 's1' };
      req.query = { format: 'json' };
      mockSvc.get.mockResolvedValue({ id: 's1', userId: 1, results: { vulns: [{ title: 'XSS' }] } });
      await scanController.exportScan(req, res, next);
      expect(res.setHeader).toHaveBeenCalled();
      expect(res.send).toHaveBeenCalled();
    });
  });

  describe('exportGroup', () => {
    it('exports group as json', async () => {
      req.params = { groupId: 'grp1' };
      req.query = { format: 'json' };
      mockSvc.getByGroupId.mockResolvedValue([{ id: 's1', userId: 1, results: { vulns: [{ title: 'XSS' }] } }]);
      await scanController.exportGroup(req, res, next);
      expect(res.setHeader).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalled();
      expect(res.end).toHaveBeenCalled();
    });
  });
});
