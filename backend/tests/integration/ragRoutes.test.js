'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const jwt = require('jsonwebtoken');

// Mock vector service
const mockVectorService = {
  search: jest.fn().mockResolvedValue([{ docId: 'doc1', score: 0.9, content: 'test result' }]),
  ingest: jest.fn().mockResolvedValue({ docId: 'doc1', chunksIngested: 3 }),
  stats:  jest.fn().mockResolvedValue({ backend: 'sqlite-vec', documents: 5, chunks: 20 }),
};

jest.mock('../../src/services/vectorService', () => ({
  getVectorService: () => mockVectorService,
}));

// Mock db and auth for middleware
jest.mock('../../src/db/database', () => ({
  getDb: () => ({
    User: {
      findByPk: jest.fn().mockImplementation(async (id) => ({
        id,
        role: id === 'admin-id' ? 'admin' : 'viewer'
      }))
    }
  })
}));

const ragController = require('../../src/controllers/ragController');
const authenticate  = require('../../src/middleware/authenticate');
const adminOnly     = require('../../src/middleware/adminOnly');
const errorHandler  = require('../../src/middleware/errorHandler');

// Build a minimal express app
const app = express();
app.use(express.json());
app.post('/api/rag/search', authenticate, ragController.search);
app.post('/api/rag/ingest', authenticate, adminOnly, ragController.ingest);
app.get('/api/rag/stats',   authenticate, adminOnly, ragController.stats);
app.use(errorHandler);

const JWT_SECRET = process.env.JWT_SECRET || 'test-secret';
function makeToken(id = 'user-id') {
  return jwt.sign({ id }, JWT_SECRET);
}
function makeAdminToken() {
  return jwt.sign({ id: 'admin-id' }, JWT_SECRET);
}

describe('RAG Routes Integration', () => {
  let consoleErrorSpy;

  beforeEach(() => {
    jest.clearAllMocks();
    consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleErrorSpy?.mockRestore();
  });

  // ── POST /api/rag/search ──────────────────────────────────────────────────
  describe('POST /api/rag/search', () => {
    it('returns results for a valid query', async () => {
      const res = await request(app)
        .post('/api/rag/search')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ query: 'open ports', topK: 3 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.results).toHaveLength(1);
      expect(mockVectorService.search).toHaveBeenCalledWith('open ports', 3);
    });

    it('returns 400 when query is missing', async () => {
      const res = await request(app)
        .post('/api/rag/search')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('query is required');
    });

    it('calls next(err) on service error', async () => {
      mockVectorService.search.mockRejectedValueOnce(new Error('DB error'));
      // Express will return 500 via default error handler
      const res = await request(app)
        .post('/api/rag/search')
        .set('Authorization', `Bearer ${makeToken()}`)
        .send({ query: 'test' });
      // Either 500 or passing to next; in our minimal app it propagates
      expect([400, 500]).toContain(res.status);
    });
  });

  // ── POST /api/rag/ingest ──────────────────────────────────────────────────
  describe('POST /api/rag/ingest', () => {
    it('ingests a document successfully', async () => {
      const res = await request(app)
        .post('/api/rag/ingest')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ docId: 'doc1', text: 'some text content here' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.chunksIngested).toBe(3);
    });

    it('returns 400 when docId is missing', async () => {
      const res = await request(app)
        .post('/api/rag/ingest')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ text: 'some text' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('docId and text are required');
    });

    it('returns 400 when text is missing', async () => {
      const res = await request(app)
        .post('/api/rag/ingest')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ docId: 'doc1' });

      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('docId and text are required');
    });

    it('passes options to vectorService.ingest', async () => {
      await request(app)
        .post('/api/rag/ingest')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ docId: 'doc2', text: 'hello world', chunkStrategy: 'fixed', maxTokens: 100, overlap: 10 });

      expect(mockVectorService.ingest).toHaveBeenCalledWith(
        'doc2', 'hello world', { chunkStrategy: 'fixed', maxTokens: 100, overlap: 10 }
      );
    });

    it('calls next(err) on service error', async () => {
      mockVectorService.ingest.mockRejectedValueOnce(new Error('Ingest error'));
      const res = await request(app)
        .post('/api/rag/ingest')
        .set('Authorization', `Bearer ${makeAdminToken()}`)
        .send({ docId: 'doc1', text: 'some text' });
      expect([400, 500]).toContain(res.status);
    });
  });

  // ── GET /api/rag/stats ────────────────────────────────────────────────────
  describe('GET /api/rag/stats', () => {
    it('returns stats successfully', async () => {
      const res = await request(app)
        .get('/api/rag/stats')
        .set('Authorization', `Bearer ${makeAdminToken()}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.stats.backend).toBe('sqlite-vec');
    });

    it('calls next(err) on service error', async () => {
      mockVectorService.stats.mockRejectedValueOnce(new Error('Stats error'));
      const res = await request(app)
        .get('/api/rag/stats')
        .set('Authorization', `Bearer ${makeAdminToken()}`);
      expect([400, 500]).toContain(res.status);
    });
  });
});
