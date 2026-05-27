'use strict';

process.env.NODE_ENV = 'test';

const apiKeyAuth = require('../../src/middleware/apiKeyAuth');
const crypto = require('crypto');

// Mock db
jest.mock('../../src/db/database', () => {
  const mockFindOne = jest.fn();
  const mockFindByPk = jest.fn();

  return {
    getDb: () => ({
      ApiKey: { findOne: mockFindOne },
      User: { findByPk: mockFindByPk }
    }),
    mockFindOne,
    mockFindByPk
  };
});

describe('apiKeyAuth Middleware Unit Tests', () => {
  let req;
  let res;
  let next;
  let dbMocks;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    dbMocks = require('../../src/db/database');
    jest.clearAllMocks();
  });

  it('calls next() immediately if no x-api-key header', async () => {
    await apiKeyAuth(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith(); // no args
    expect(dbMocks.mockFindOne).not.toHaveBeenCalled();
  });

  it('calls next() if api key not found', async () => {
    req.headers['x-api-key'] = 'test-key';
    dbMocks.mockFindOne.mockResolvedValueOnce(null);

    await apiKeyAuth(req, res, next);
    
    expect(dbMocks.mockFindOne).toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('returns 401 if api key is revoked', async () => {
    req.headers['x-api-key'] = 'test-key';
    dbMocks.mockFindOne.mockResolvedValueOnce({ revoked_at: new Date() });

    await apiKeyAuth(req, res, next);
    
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: { message: 'API key has been revoked' }
    }));
    expect(next).not.toHaveBeenCalled();
  });

  it('calls next() if user not found', async () => {
    req.headers['x-api-key'] = 'test-key';
    dbMocks.mockFindOne.mockResolvedValueOnce({ user_id: 'u1' });
    dbMocks.mockFindByPk.mockResolvedValueOnce(null);

    await apiKeyAuth(req, res, next);
    
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('attaches req.user and req.apiKey and calls next()', async () => {
    req.headers['x-api-key'] = 'test-key';
    
    const mockUpdate = jest.fn().mockResolvedValue();
    dbMocks.mockFindOne.mockResolvedValueOnce({
      id: 'k1',
      name: 'Key 1',
      scopes_json: '["admin"]',
      user_id: 'u1',
      update: mockUpdate
    });
    
    dbMocks.mockFindByPk.mockResolvedValueOnce({
      id: 'u1',
      username: 'user1',
      role: 'admin'
    });

    await apiKeyAuth(req, res, next);
    
    expect(req.user).toEqual({ id: 'u1', username: 'user1', role: 'admin' });
    expect(req.apiKey).toEqual({ id: 'k1', name: 'Key 1', scopes: '["admin"]' });
    expect(mockUpdate).toHaveBeenCalledWith(expect.objectContaining({
      last_used_at: expect.any(Date)
    }));
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });

  it('catches and passes errors to next()', async () => {
    req.headers['x-api-key'] = 'test-key';
    const err = new Error('DB failed');
    dbMocks.mockFindOne.mockRejectedValueOnce(err);

    await apiKeyAuth(req, res, next);
    
    expect(next).toHaveBeenCalledWith(err);
  });
});
