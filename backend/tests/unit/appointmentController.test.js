'use strict';

const appointmentController = require('../../src/controllers/appointmentController');

const mockSvc = {
  create: jest.fn(),
  list: jest.fn(),
  get: jest.fn(),
  update: jest.fn(),
  delete: jest.fn(),
  getScans: jest.fn(),
  getChats: jest.fn(),
  linkChat: jest.fn(),
  getFullContext: jest.fn()
};

jest.mock('../../src/services/appointmentService', () => ({
  getAppointmentService: () => mockSvc
}));

describe('appointmentController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, params: {}, query: {}, user: { id: 'u1' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      send: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('create', () => {
    it('returns 400 if name is missing', async () => {
      await appointmentController.create(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('creates and returns 201', async () => {
      req.body = { name: 'Appt 1', mode: 'manual' };
      mockSvc.create.mockResolvedValue({ id: 'a1', name: 'Appt 1' });

      await appointmentController.create(req, res, next);

      expect(mockSvc.create).toHaveBeenCalledWith('u1', { name: 'Appt 1', mode: 'manual' });
      expect(res.status).toHaveBeenCalledWith(201);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('list', () => {
    it('returns appointment list', async () => {
      mockSvc.list.mockResolvedValue({ appointments: [] });

      await appointmentController.list(req, res, next);

      expect(mockSvc.list).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('get', () => {
    it('returns 404 if not found', async () => {
      req.params.id = 'a1';
      mockSvc.get.mockResolvedValue(null);

      await appointmentController.get(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns appointment', async () => {
      req.params.id = 'a1';
      mockSvc.get.mockResolvedValue({ id: 'a1', userId: 'u1' });

      await appointmentController.get(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('update', () => {
    it('returns 404 if not found', async () => {
      req.params.id = 'a1';
      mockSvc.get.mockResolvedValueOnce(null);

      await appointmentController.update(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('updates and returns appointment', async () => {
      req.params.id = 'a1';
      req.body = { name: 'New Name' };
      mockSvc.update.mockResolvedValue({ id: 'a1', name: 'New Name' });

      await appointmentController.update(req, res, next);

      expect(mockSvc.update).toHaveBeenCalledWith('a1', { name: 'New Name' });
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('remove', () => {
    it('deletes appointment', async () => {
      req.params.id = 'a1';

      await appointmentController.remove(req, res, next);

      expect(mockSvc.delete).toHaveBeenCalledWith('a1');
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getScans', () => {
    it('returns scans', async () => {
      req.params.id = 'a1';
      mockSvc.getScans.mockResolvedValue([{ id: 's1' }]);

      await appointmentController.getScans(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('getChats', () => {
    it('returns chats', async () => {
      req.params.id = 'a1';
      mockSvc.getChats.mockResolvedValue([{ id: 'c1' }]);

      await appointmentController.getChats(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('createChat', () => {
    it('creates a chat and returns 201', async () => {
      req.params.id = 'a1';
      req.body = { provider: 'groq', model: 'm1', messages: [] };
      mockSvc.linkChat.mockResolvedValue({ id: 'ch1' });

      await appointmentController.createChat(req, res, next);

      expect(mockSvc.linkChat).toHaveBeenCalledWith('a1', { provider: 'groq', model: 'm1', messages: [] });
      expect(res.status).toHaveBeenCalledWith(201);
    });
  });

  describe('getFullContext', () => {
    it('returns 404 if context not found', async () => {
      req.params.id = 'a1';
      mockSvc.get.mockResolvedValueOnce(null);

      await appointmentController.getFullContext(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns full context', async () => {
      req.params.id = 'a1';
      mockSvc.getFullContext.mockResolvedValue({ id: 'a1', scans: [], chats: [] });

      await appointmentController.getFullContext(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
