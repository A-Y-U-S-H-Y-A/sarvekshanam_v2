const ragController = require('../../src/controllers/ragController');

jest.mock('../../src/services/vectorService', () => ({
  getVectorService: jest.fn().mockReturnValue({
    search: jest.fn().mockResolvedValue([]),
    ingest: jest.fn().mockResolvedValue({}),
    stats: jest.fn().mockResolvedValue({})
  })
}));
describe('RagController', () => {
  let req, res, next;

  beforeEach(() => {
    req = { user: { id: 1 }, body: {}, params: {} };
    res = { status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn() };
    next = jest.fn();
    jest.clearAllMocks();
  });

  it('calls search', async () => {
    req.body = { query: 'test query' };
    await ragController.search(req, res, next);
  });

  it('calls ingest', async () => {
    req.body = { docId: 'doc1', text: 'hello' };
    await ragController.ingest(req, res, next);
  });

  it('calls stats', async () => {
    await ragController.stats(req, res, next);
  });
});
