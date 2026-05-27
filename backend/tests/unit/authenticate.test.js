'use strict';

process.env.NODE_ENV = 'test';

const authenticate = require('../../src/middleware/authenticate');
const passport = require('../../src/auth/passport');

jest.mock('../../src/middleware/apiKeyAuth', () => jest.fn());
jest.mock('../../src/auth/passport', () => ({
  authenticate: jest.fn()
}));

const apiKeyAuth = require('../../src/middleware/apiKeyAuth');

describe('authenticate Middleware Unit Tests', () => {
  let req;
  let res;
  let next;

  beforeEach(() => {
    req = { headers: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('passes error from apiKeyAuth', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => cb(new Error('err')));
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('calls next if apiKeyAuth succeeds and sets req.user', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => {
      req.user = { id: 1 };
      cb();
    });
    authenticate(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
    expect(passport.authenticate).not.toHaveBeenCalled();
  });

  it('falls back to JWT if apiKeyAuth does not set user', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => cb());
    const mockPassportAuth = jest.fn((req, res, next) => {});
    
    passport.authenticate.mockImplementation((strategy, opts, cb) => {
      expect(strategy).toBe('jwt');
      return mockPassportAuth;
    });

    authenticate(req, res, next);
    
    expect(passport.authenticate).toHaveBeenCalled();
    expect(mockPassportAuth).toHaveBeenCalledWith(req, res, next);
  });

  it('handles JWT authentication errors', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => cb());
    
    passport.authenticate.mockImplementation((strategy, opts, cb) => {
      cb(new Error('jwt error'));
      return jest.fn();
    });

    authenticate(req, res, next);
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it('returns 401 if JWT authentication returns no user', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => cb());
    
    passport.authenticate.mockImplementation((strategy, opts, cb) => {
      cb(null, false);
      return jest.fn();
    });

    authenticate(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('sets req.user and calls next if JWT auth succeeds', () => {
    apiKeyAuth.mockImplementationOnce((req, res, cb) => cb());
    
    passport.authenticate.mockImplementation((strategy, opts, cb) => {
      cb(null, { id: 2 });
      return jest.fn();
    });

    authenticate(req, res, next);
    expect(req.user).toEqual({ id: 2 });
    expect(next).toHaveBeenCalledTimes(1);
    expect(next).toHaveBeenCalledWith();
  });
});
