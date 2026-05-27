'use strict';

process.env.NODE_ENV = 'test';

const adminOnly = require('../../src/middleware/adminOnly');

describe('adminOnly middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  it('calls next if user is admin', () => {
    req.user = { role: 'admin' };
    adminOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('returns 403 if user role is not admin', () => {
    req.user = { role: 'viewer' };
    adminOnly(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 401 if req.user is missing', () => {
    adminOnly(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
  });
});
