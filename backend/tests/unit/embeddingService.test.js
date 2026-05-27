'use strict';

process.env.NODE_ENV = 'test';

const { EmbeddingService, getEmbeddingService, _resetEmbeddingService } = require('../../src/services/embeddingService');
const config = require('../../src/config');

describe('EmbeddingService Unit Tests', () => {
  let svc;
  let originalFetch;

  beforeEach(() => {
    _resetEmbeddingService();
    svc = getEmbeddingService();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    
    // Default configs for testing
    config.embeddingModel = 'text-embedding-3-small';
    config.openaiApiKey = 'mock-key';
    config.ollamaBaseUrl = 'http://localhost:11434';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    jest.clearAllMocks();
  });

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const i1 = getEmbeddingService();
      const i2 = getEmbeddingService();
      expect(i1).toBe(i2);
      expect(i1).toBeInstanceOf(EmbeddingService);
    });
  });

  describe('embedOne', () => {
    it('returns a single array from embed()', async () => {
      jest.spyOn(svc, 'embed').mockResolvedValueOnce([[0.1, 0.2]]);
      const res = await svc.embedOne('hello');
      expect(res).toEqual([0.1, 0.2]);
      expect(svc.embed).toHaveBeenCalledWith(['hello']);
    });
  });

  describe('embed (routing)', () => {
    it('returns empty array if texts is empty', async () => {
      expect(await svc.embed([])).toEqual([]);
    });

    it('routes to OpenAI if model starts with text-embedding', async () => {
      config.embeddingModel = 'text-embedding-3';
      jest.spyOn(svc, '_embedOpenAI').mockResolvedValueOnce([[1]]);
      await svc.embed(['hello']);
      expect(svc._embedOpenAI).toHaveBeenCalledWith(['hello']);
    });

    it('routes to OpenAI if model starts with ada', async () => {
      config.embeddingModel = 'ada-002';
      jest.spyOn(svc, '_embedOpenAI').mockResolvedValueOnce([[1]]);
      await svc.embed(['hello']);
      expect(svc._embedOpenAI).toHaveBeenCalledWith(['hello']);
    });

    it('routes to Ollama if baseUrl is set and model is not OpenAI', async () => {
      config.embeddingModel = 'llama3';
      config.ollamaBaseUrl = 'http://localhost';
      jest.spyOn(svc, '_embedOllama').mockResolvedValueOnce([[1]]);
      await svc.embed(['hello']);
      expect(svc._embedOllama).toHaveBeenCalledWith(['hello']);
    });

    it('routes to hash fallback if no ollama url and not OpenAI', async () => {
      config.embeddingModel = 'local-model';
      config.ollamaBaseUrl = '';
      jest.spyOn(svc, '_hashEmbed').mockReturnValueOnce([0.5]);
      const res = await svc.embed(['hello']);
      expect(res).toEqual([[0.5]]);
    });
  });

  describe('OpenAI', () => {
    it('falls back to hash if no API key', async () => {
      config.openaiApiKey = '';
      jest.spyOn(svc, '_hashEmbed').mockReturnValue([0.1]);
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      
      const res = await svc._embedOpenAI(['test']);
      expect(res).toEqual([[0.1]]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('calls OpenAI API and returns sorted embeddings', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          data: [
            { index: 1, embedding: [0.3, 0.4] },
            { index: 0, embedding: [0.1, 0.2] }
          ]
        })
      });

      const res = await svc._embedOpenAI(['a', 'b']);
      expect(global.fetch).toHaveBeenCalledWith('https://api.openai.com/v1/embeddings', expect.any(Object));
      expect(res).toEqual([[0.1, 0.2], [0.3, 0.4]]);
      expect(svc.dimensions).toBe(2);
    });

    it('falls back to hash on API error', async () => {
      global.fetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        text: async () => 'Bad request'
      });
      jest.spyOn(svc, '_hashEmbed').mockReturnValue([0.1]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await svc._embedOpenAI(['test']);
      expect(res).toEqual([[0.1]]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('falls back to hash on network error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Net error'));
      jest.spyOn(svc, '_hashEmbed').mockReturnValue([0.1]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await svc._embedOpenAI(['test']);
      expect(res).toEqual([[0.1]]);
      consoleSpy.mockRestore();
    });
  });

  describe('Ollama', () => {
    it('calls Ollama API sequentially', async () => {
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: [0.1] }) })
        .mockResolvedValueOnce({ ok: true, json: async () => ({ embedding: [0.2] }) });

      const res = await svc._embedOllama(['a', 'b']);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(res).toEqual([[0.1], [0.2]]);
      expect(svc.dimensions).toBe(1);
    });

    it('falls back to hash on API error', async () => {
      global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });
      jest.spyOn(svc, '_hashEmbed').mockReturnValue([0.1]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await svc._embedOllama(['test']);
      expect(res).toEqual([[0.1]]);
      expect(consoleSpy).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });

    it('falls back to hash on network error', async () => {
      global.fetch.mockRejectedValueOnce(new Error('Net error'));
      jest.spyOn(svc, '_hashEmbed').mockReturnValue([0.1]);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await svc._embedOllama(['test']);
      expect(res).toEqual([[0.1]]);
      consoleSpy.mockRestore();
    });
  });

  describe('Hash Fallback', () => {
    it('generates deterministic embeddings', () => {
      const vec1 = svc._hashEmbed('test');
      const vec2 = svc._hashEmbed('test');
      expect(vec1).toEqual(vec2);
      expect(vec1.length).toBe(svc.dimensions);
    });

    it('normalizes to unit length', () => {
      const vec = svc._hashEmbed('hello world');
      const norm = Math.sqrt(vec.reduce((s, v) => s + v * v, 0));
      expect(norm).toBeCloseTo(1.0, 5);
    });
    
    it('handles empty string without NaN', () => {
      const vec = svc._hashEmbed('');
      expect(vec.some(v => isNaN(v))).toBe(false);
    });
  });
});
