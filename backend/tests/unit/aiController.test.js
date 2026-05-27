'use strict';

const aiController = require('../../src/controllers/aiController');

jest.mock('../../src/services/aiService', () => ({
  getAIService: () => mockAI
}));
jest.mock('../../src/services/scanSessionService', () => ({
  getScanSessionService: () => ({ get: jest.fn() })
}));

const mockAI = {
  stream: null,
  listProviders: jest.fn()
};

describe('aiController Unit Tests', () => {
  let req, res, next;

  beforeEach(() => {
    req = { body: {}, params: {}, user: { id: 'u1' } };
    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
      setHeader: jest.fn(),
      flushHeaders: jest.fn(),
      write: jest.fn(),
      end: jest.fn(),
      headersSent: false
    };
    next = jest.fn();
    jest.clearAllMocks();
    mockAI.stream = null;
    mockAI.listProviders = jest.fn();
  });

  describe('chat (SSE)', () => {
    it('returns 400 if messages array is empty', async () => {
      req.body = { messages: [] };
      await aiController.chat(req, res, next);
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: false })
      );
    });

    it('sets SSE headers and streams chunks', async () => {
      req.body = { provider: 'groq', appointmentId: 'appt-1', messages: [{ role: 'user', content: 'hi' }] };

      async function* fakeStream() {
        yield 'Hello';
        yield ' World';
      }
      mockAI.stream = jest.fn().mockReturnValue(fakeStream());

      await aiController.chat(req, res, next);

      expect(res.setHeader).toHaveBeenCalledWith('Content-Type', 'text/event-stream');
      expect(res.flushHeaders).toHaveBeenCalled();
      expect(res.write).toHaveBeenCalledWith(expect.stringContaining('"Hello"'));
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(res.end).toHaveBeenCalled();
    });

    it('writes error event if stream throws', async () => {
      req.body = { provider: 'groq', appointmentId: 'appt-1', messages: [{ role: 'user', content: 'hi' }] };

      async function* badStream() {
        throw new Error('stream exploded');
        yield 'never';  // eslint-disable-line no-unreachable
      }
      mockAI.stream = jest.fn().mockReturnValue(badStream());

      await aiController.chat(req, res, next);

      expect(res.write).toHaveBeenCalledWith(
        expect.stringContaining('"stream exploded"')
      );
      expect(res.write).toHaveBeenCalledWith('data: [DONE]\n\n');
      expect(res.end).toHaveBeenCalled();
    });
  });

  describe('listProviders', () => {
    it('returns providers', async () => {
      mockAI.listProviders.mockResolvedValue({ groq: { models: ['llama3'] } });

      await aiController.listProviders(req, res, next);

      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ success: true })
      );
    });

    it('passes errors to next', async () => {
      const err = new Error('boom');
      mockAI.listProviders.mockRejectedValue(err);

      await aiController.listProviders(req, res, next);

      expect(next).toHaveBeenCalledWith(err);
    });
  });
});
