const apiKeyController = require('../../src/controllers/apiKeyController');

jest.mock('../../src/services/cryptoService', () => ({
  generateApiKey: jest.fn().mockReturnValue('test-key'),
  hashApiKey: jest.fn().mockReturnValue('hashed-key')
}));

describe('ApiKeyController', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: { id: 1 }, body: {}, params: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('calls create', async () => {
    req.body = { name: 'test key' };
    await apiKeyController.create(req, res, next);
  });

  it('calls list', async () => {
    await apiKeyController.list(req, res, next);
  });

  it('calls revoke', async () => {
    req.params = { id: 1 };
    await apiKeyController.revoke(req, res, next);
  });
});
