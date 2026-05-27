'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');
const router  = require('../../src/routes/queueRoutes');

const mockQueueSvc = {
  getQueueStatus: jest.fn()
};

jest.mock('../../src/services/executionQueueService', () => ({
  getExecutionQueueService: () => mockQueueSvc
}));

jest.mock('../../src/db/database', () => ({
  getDb: () => ({
    User: {
      findByPk: jest.fn(async (id) => ({ id, role: 'viewer' }))
    }
  })
}));

const app = express();
app.use(express.json());
app.use('/api/queue', router);

function token(userId = 'u1') {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Queue Routes Integration Tests', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /api/queue/status', () => {
    it('requires authentication', async () => {
      const res = await request(app).get('/api/queue/status');
      expect(res.status).toBe(401);
    });

    it('returns queue status for authenticated user', async () => {
      mockQueueSvc.getQueueStatus.mockReturnValue({
        running: 2,
        queued: 5,
        maxConcurrent: 5
      });

      const res = await request(app)
        .get('/api/queue/status')
        .set('Authorization', `Bearer ${token()}`);

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(2);
      expect(res.body.queued).toBe(5);
      expect(res.body.maxConcurrent).toBe(5);
    });

    it('returns zero counts when queues are empty', async () => {
      mockQueueSvc.getQueueStatus.mockReturnValue({
        running: 0,
        queued: 0,
        maxConcurrent: 5
      });

      const res = await request(app)
        .get('/api/queue/status')
        .set('Authorization', `Bearer ${token()}`);

      expect(res.status).toBe(200);
      expect(res.body.running).toBe(0);
      expect(res.body.queued).toBe(0);
    });
  });
});
