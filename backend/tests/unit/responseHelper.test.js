const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../../src/utils/responseHelper');

describe('ResponseHelper', () => {
  let res;
  beforeEach(() => {
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };
  });

  it('sendSuccess', () => {
    sendSuccess(res, { data: 'test' });
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, data: { data: 'test' } });
  });

  it('sendSuccess with custom status', () => {
    sendSuccess(res, { data: 'test' }, 201);
    expect(res.status).toHaveBeenCalledWith(201);
  });

  it('sendError', () => {
    sendError(res, 'error');
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, error: { message: 'error' } });
  });

  it('sendNotFound', () => {
    sendNotFound(res, 'not found');
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('sendForbidden', () => {
    sendForbidden(res, 'forbidden');
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
