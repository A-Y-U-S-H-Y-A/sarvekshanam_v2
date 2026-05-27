'use strict';

process.env.NODE_ENV = 'test';

const errorHandler = require('../../src/middleware/errorHandler');

describe('errorHandler middleware', () => {
  let req, res, next;

  beforeEach(() => {
    req = {};
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
    next = jest.fn();
  });

  it('uses err.status when provided', () => {
    const err = new Error('Not Found');
    err.status = 404;
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ message: 'Not Found', status: 404 })
    }));
  });

  it('defaults to 500 when no status on error', () => {
    const err = new Error('Something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.objectContaining({ status: 500 })
    }));
  });

  it('uses err.statusCode as fallback', () => {
    const err = new Error('Unauthorized');
    err.statusCode = 401;
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('uses Internal Server Error message if err.message is empty', () => {
    const err = {};
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.objectContaining({ message: 'Internal Server Error' })
    }));
  });
});
