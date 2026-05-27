'use strict';

const moduleController = require('../../src/controllers/moduleController');

const mockRegistry = {
  getByCategory: jest.fn(),
  getById: jest.fn(),
  size: 2
};

jest.mock('../../src/modules/registry', () => ({
  getRegistry: () => mockRegistry
}));

describe('moduleController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('listModules', () => {
    it('returns grouped categories and total', () => {
      mockRegistry.getByCategory.mockReturnValue({ recon: [{ meta: { id: 'm1' } }] });

      moduleController.listModules(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ total: 2 })
      }));
    });
  });

  describe('getModule', () => {
    it('returns 404 if not found', () => {
      req.params.id = 'unknown';
      mockRegistry.getById.mockReturnValue(null);

      moduleController.getModule(req, res, next);

      expect(res.status).toHaveBeenCalledWith(404);
    });

    it('returns module meta', () => {
      req.params.id = 'm1';
      mockRegistry.getById.mockReturnValue({ meta: { id: 'm1', name: 'Module 1' } });

      moduleController.getModule(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: { module: { id: 'm1', name: 'Module 1' } }
      }));
    });
  });
});
