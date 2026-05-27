'use strict';

process.env.NODE_ENV = 'test';

const { VectorService, getVectorService, _resetVectorService } = require('../../src/services/vectorService');
const config = require('../../src/config');
const { getEmbeddingService } = require('../../src/services/embeddingService');
const { getChunkingService } = require('../../src/services/chunkingService');

// Mock dependencies
jest.mock('../../src/services/embeddingService', () => ({
  getEmbeddingService: jest.fn()
}));

jest.mock('../../src/services/chunkingService', () => ({
  getChunkingService: jest.fn()
}));

jest.mock('../../src/services/vectorBackends/sqliteVecBackend', () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    ingest: jest.fn().mockResolvedValue(),
    search: jest.fn().mockResolvedValue([{ docId: '1', score: 0.9 }]),
    delete: jest.fn().mockResolvedValue(),
    stats: jest.fn().mockResolvedValue({ chunks: 5 }),
    close: jest.fn().mockResolvedValue()
  }));
});

jest.mock('../../src/services/vectorBackends/chromaDBBackend', () => {
  return jest.fn().mockImplementation(() => ({
    init: jest.fn().mockResolvedValue(),
    ingest: jest.fn().mockResolvedValue(),
    search: jest.fn().mockResolvedValue([{ docId: '2', score: 0.8 }]),
    delete: jest.fn().mockResolvedValue(),
    stats: jest.fn().mockResolvedValue({ chunks: 10 }),
    close: jest.fn().mockResolvedValue()
  }));
});

describe('VectorService Unit Tests', () => {
  let svc;
  let mockEmbedder;
  let mockChunker;

  beforeEach(() => {
    _resetVectorService();
    config.vectorDbBackend = 'sqlite-vec';
    svc = getVectorService();

    mockEmbedder = {
      embed: jest.fn().mockResolvedValue([[0.1, 0.2]]),
      embedOne: jest.fn().mockResolvedValue([0.1, 0.2])
    };
    getEmbeddingService.mockReturnValue(mockEmbedder);

    mockChunker = {
      fixedSize: jest.fn().mockReturnValue([{ content: 'chunk1', tokenEstimate: 2 }]),
      sentenceBoundary: jest.fn().mockReturnValue([{ content: 'chunk1', tokenEstimate: 2 }])
    };
    getChunkingService.mockReturnValue(mockChunker);
  });

  afterEach(async () => {
    await svc.close();
    jest.clearAllMocks();
  });

  describe('Initialization', () => {
    it('initializes sqlite-vec by default', async () => {
      await svc._ensureInit();
      expect(svc._backend).toBeDefined();
      expect(svc._backend.init).toHaveBeenCalled();
      expect(svc._initialized).toBe(true);
    });

    it('initializes chromadb when configured', async () => {
      config.vectorDbBackend = 'chromadb';
      await svc._ensureInit();
      expect(svc._backend).toBeDefined();
      expect(svc._backend.init).toHaveBeenCalled();
    });

    it('throws error if initialization fails', async () => {
      config.vectorDbBackend = 'sqlite-vec';
      const SqliteVecBackend = require('../../src/services/vectorBackends/sqliteVecBackend');
      SqliteVecBackend.mockImplementationOnce(() => ({
        init: jest.fn().mockRejectedValue(new Error('Init failed'))
      }));
      
      const newSvc = new VectorService();
      await expect(newSvc._ensureInit()).rejects.toThrow('Init failed');
    });
  });

  describe('Ingestion', () => {
    it('uses sentence boundary chunking by default', async () => {
      const res = await svc.ingest('doc1', 'text content');
      
      expect(mockChunker.sentenceBoundary).toHaveBeenCalledWith('text content', 500);
      expect(mockEmbedder.embed).toHaveBeenCalledWith(['chunk1']);
      expect(svc._backend.ingest).toHaveBeenCalledWith('doc1', [
        { content: 'chunk1', embedding: [0.1, 0.2], tokenEstimate: 2 }
      ]);
      expect(res.chunksIngested).toBe(1);
    });

    it('uses fixed size chunking when configured', async () => {
      await svc.ingest('doc1', 'text content', { chunkStrategy: 'fixed', maxTokens: 100, overlap: 20 });
      
      expect(mockChunker.fixedSize).toHaveBeenCalledWith('text content', 100, 20);
    });

    it('returns 0 chunks if chunker returns empty array', async () => {
      mockChunker.sentenceBoundary.mockReturnValue([]);
      const res = await svc.ingest('doc1', 'text content');
      expect(res.chunksIngested).toBe(0);
      expect(mockEmbedder.embed).not.toHaveBeenCalled();
    });
  });

  describe('Search', () => {
    it('embeds query and searches backend', async () => {
      const res = await svc.search('my query', 3);
      expect(mockEmbedder.embedOne).toHaveBeenCalledWith('my query');
      expect(svc._backend.search).toHaveBeenCalledWith([0.1, 0.2], 3, {});
      expect(res).toEqual([{ docId: '1', score: 0.9 }]);
    });
  });

  describe('Deletion', () => {
    it('calls backend delete', async () => {
      await svc.delete('doc1');
      expect(svc._backend.delete).toHaveBeenCalledWith('doc1');
    });
  });

  describe('Stats', () => {
    it('calls backend stats', async () => {
      const stats = await svc.stats();
      expect(svc._backend.stats).toHaveBeenCalled();
      expect(stats.chunks).toBe(5);
    });
  });

  describe('Close', () => {
    it('calls backend close and cleans up', async () => {
      await svc._ensureInit();
      await svc.close();
      expect(svc._backend).toBeNull();
      expect(svc._initialized).toBe(false);
    });

    it('close() is safe to call on uninitialized service', async () => {
      // svc has not been initialized — _backend is null
      await expect(svc.close()).resolves.not.toThrow();
    });

    it('_resetVectorService safely handles uninitialized instances', () => {
      _resetVectorService(); // Should not throw
    });
  });

  describe('Idempotent Initialization', () => {
    it('_ensureInit() does nothing if already initialized', async () => {
      await svc._ensureInit();
      const backend = svc._backend;
      // Call again — should not re-create the backend
      await svc._ensureInit();
      expect(svc._backend).toBe(backend);
      expect(backend.init).toHaveBeenCalledTimes(1);
    });
  });

  describe('Fixed strategy default overlap', () => {
    it('ingest with fixed strategy uses default overlap when not specified', async () => {
      await svc.ingest('doc1', 'text content', { chunkStrategy: 'fixed' });
      // overlap not specified → uses default 50
      expect(mockChunker.fixedSize).toHaveBeenCalledWith('text content', 500, 50);
    });
  });

  describe('Search default topK', () => {
    it('search() with default topK=5', async () => {
      await svc.search('my query');
      expect(svc._backend.search).toHaveBeenCalledWith([0.1, 0.2], 5, {});
    });
  });
});
