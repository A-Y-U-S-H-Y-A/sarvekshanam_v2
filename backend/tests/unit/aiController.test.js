const aiController = require('../../src/controllers/aiController');

jest.mock('../../src/services/aiService', () => {
  const mockStream = jest.fn();
  return {
    getAIService: jest.fn().mockReturnValue({
      stream: mockStream,
      listProviders: jest.fn().mockResolvedValue([]),
      fetchModelsFromAPI: jest.fn().mockResolvedValue([]),
      setLocalModels: jest.fn(),
      addLocalModel: jest.fn(),
      removeLocalModel: jest.fn()
    }),
    mockStream // export for testing
  };
});

jest.mock('../../src/services/scanSessionService', () => {
  const mockScanSvc = { get: jest.fn() };
  return {
    getScanSessionService: jest.fn().mockReturnValue(mockScanSvc),
    mockScanSvc
  };
});

jest.mock('../../src/services/appointmentService', () => ({
  getAppointmentService: jest.fn().mockReturnValue({
    getFullContext: jest.fn().mockResolvedValue({ id: 1 })
  })
}));

const mockChunkSvc = {
  estimateTokens: jest.fn()
};
jest.mock('../../src/services/chunkingService', () => ({
  getChunkingService: jest.fn().mockReturnValue(mockChunkSvc)
}));

const mockVectorSvc = {
  ingest: jest.fn()
};
jest.mock('../../src/services/vectorService', () => ({
  getVectorService: jest.fn().mockReturnValue(mockVectorSvc)
}));

describe('AIController Unit Tests', () => {
  let req, res, next, mockStream, mockScanSvc;

  beforeEach(() => {
    mockStream = require('../../src/services/aiService').mockStream;
    mockScanSvc = require('../../src/services/scanSessionService').mockScanSvc;
    req = { user: { id: 1 }, body: {}, params: {} };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      on: jest.fn(),
      flushHeaders: jest.fn()
    };
    next = jest.fn();
    jest.clearAllMocks();
  });

  describe('chat', () => {
    it('returns 400 if missing messages', async () => {
      await aiController.chat(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('returns 400 if missing appointmentId', async () => {
      req.body = { messages: [{ role: 'user', content: 'hi' }] };
      await aiController.chat(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });

    it('handles normal chat without sessionIds', async () => {
      req.body = { messages: [{ role: 'user', content: 'hi' }], appointmentId: 1 };
      
      require('../../src/services/aiService').mockStream.mockImplementation(async function* () {
        yield { type: 'chunk', text: 'hello' };
      });

      await aiController.chat(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('hello'));
      expect(res.end).toHaveBeenCalled();
    });

    it('handles sessionIds < 4000 tokens', async () => {
      req.body = { messages: [{ role: 'user', content: 'hi' }], appointmentId: 1, sessionIds: ['s1'] };
      
      mockScanSvc.get.mockResolvedValue({ id: 's1', name: 'scan1', targets: ['t1'], results: { vulns: [] } });
      mockChunkSvc.estimateTokens.mockReturnValue(500);
      
      require('../../src/services/aiService').mockStream.mockImplementation(async function* () {
        yield { type: 'chunk', text: 'world' };
      });

      await aiController.chat(req, res, next);
      
      expect(mockScanSvc.get).toHaveBeenCalledWith('s1');
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('world'));
    });

    it('handles sessionIds > 4000 tokens (vector ingest)', async () => {
      req.body = { messages: [{ role: 'user', content: 'hi' }], appointmentId: 1, sessionIds: ['s1'] };
      
      mockScanSvc.get.mockResolvedValue({ id: 's1', name: 'scan1', targets: ['t1'], results: { vulns: [] } });
      mockChunkSvc.estimateTokens.mockReturnValue(5000);
      
      require('../../src/services/aiService').mockStream.mockImplementation(async function* () {
        yield { type: 'chunk', text: 'large' };
      });

      await aiController.chat(req, res, next);
      
      expect(mockVectorSvc.ingest).toHaveBeenCalledWith('s1', expect.any(String));
    });

    it('handles chat stream error', async () => {
      req.body = { messages: [{ role: 'user', content: 'hi' }], appointmentId: 1 };
      
      require('../../src/services/aiService').mockStream.mockImplementation(async function* () {
        throw new Error('Stream failed');
      });

      await aiController.chat(req, res, next);

      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('Stream failed'));
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('listProviders', () => {
    it('returns models', async () => {
      await aiController.listProviders(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });

  describe('fetchModels', () => {
    it('fetches models', async () => {
      req.body = { providerId: 'groq' };
      await aiController.fetchModels(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
    it('returns error if fetch fails', async () => {
      req.body = { providerId: 'groq' };
      require('../../src/services/aiService').getAIService().fetchModelsFromAPI.mockRejectedValueOnce(new Error('fail'));
      await aiController.fetchModels(req, res, next);
      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('addModel', () => {
    it('adds model', async () => {
      req.body = { providerId: 'groq', model: 'm1' };
      await aiController.addModel(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
    it('returns 400 if missing args', async () => {
      await aiController.addModel(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
    });
  });

  describe('removeModel', () => {
    it('removes model', async () => {
      req.body = { providerId: 'groq', model: 'm1' };
      await aiController.removeModel(req, res, next);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
    });
  });
});
