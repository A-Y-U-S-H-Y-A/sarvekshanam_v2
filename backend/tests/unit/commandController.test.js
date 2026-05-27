'use strict';

const commandController = require('../../src/controllers/commandController');

const mockSvc = {
  submit: jest.fn(),
  getHistory: jest.fn(),
  getCommand: jest.fn(),
  approve: jest.fn(),
  reject: jest.fn()
};

jest.mock('../../src/services/commandService', () => ({
  getCommandService: () => mockSvc
}));

describe('commandController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, user: { id: 'u1', username: 'alice', role: 'viewer' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('submit', () => {
    it('submits command and returns 202', async () => {
      req.body = { command: 'ls -la' };
      mockSvc.submit.mockResolvedValue({ id: 'c1', status: 'pending' });

      await commandController.submit(req, res, next);

      expect(mockSvc.submit).toHaveBeenCalledWith('u1', 'alice', 'ls -la');
      expect(res.status).toHaveBeenCalledWith(202);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('passes errors to next', async () => {
      req.body = { command: 'ls' };
      const err = new Error('denied');
      mockSvc.submit.mockRejectedValue(err);

      await commandController.submit(req, res, next);
      expect(next).toHaveBeenCalledWith(err);
    });
  });

  describe('list', () => {
    it('returns history', async () => {
      mockSvc.getHistory.mockResolvedValue({ commands: [] });

      await commandController.list(req, res, next);

      expect(mockSvc.getHistory).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getOne', () => {
    it('returns 404 if not found', async () => {
      req.params.id = 'c1';
      mockSvc.getCommand.mockResolvedValue(null);

      await commandController.getOne(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns 403 if not owner', async () => {
      req.params.id = 'c1';
      mockSvc.getCommand.mockResolvedValue({ userId: 'u2' });

      await commandController.getOne(req, res, next);

      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('returns command if owner', async () => {
      req.params.id = 'c1';
      const cmd = { id: 'c1', userId: 'u1' };
      mockSvc.getCommand.mockResolvedValue(cmd);

      await commandController.getOne(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('approve', () => {
    it('approves and returns record', async () => {
      req.params.id = 'c1';
      mockSvc.approve.mockResolvedValue({ id: 'c1', status: 'approved' });

      await commandController.approve(req, res, next);

      expect(mockSvc.approve).toHaveBeenCalledWith('u1', 'c1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('reject', () => {
    it('rejects with reason', async () => {
      req.params.id = 'c1';
      req.body = { reason: 'bad' };
      mockSvc.reject.mockResolvedValue({ id: 'c1', status: 'rejected' });

      await commandController.reject(req, res, next);

      expect(mockSvc.reject).toHaveBeenCalledWith('u1', 'c1', 'bad');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
