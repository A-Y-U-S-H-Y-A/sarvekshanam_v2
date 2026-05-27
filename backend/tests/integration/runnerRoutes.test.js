'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const router = require('../../src/routes/runnerRoutes');
const jwt = require('jsonwebtoken');

// Mock RunnerService
const mockRunnerService = {
  getRunners: jest.fn(),
  createRunner: jest.fn(),
  updateRunner: jest.fn(),
  deleteRunner: jest.fn(),
  runModuleOnHost: jest.fn()
};

jest.mock('../../src/services/runnerService', () => ({
  getRunnerService: () => mockRunnerService
}));

// Mock database to bypass real auth checks in middleware
jest.mock('../../src/db/database', () => ({
  getDb: () => ({
    User: {
      findByPk: jest.fn(async (id) => ({
        id,
        role: id === 'admin-id' ? 'admin' : 'user'
      }))
    }
  })
}));

const app = express();
app.use(express.json());
app.use('/api/runners', router);

function getValidToken(userId = 'user-id') {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Runner Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/runners', () => {
    it('should return all runners', async () => {
      mockRunnerService.getRunners.mockResolvedValueOnce([{ id: 'r1', name: 'Runner 1' }]);
      const res = await request(app)
        .get('/api/runners')
        .set('Authorization', `Bearer ${getValidToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveLength(1);
    });

    it('should handle service errors', async () => {
      mockRunnerService.getRunners.mockRejectedValueOnce(new Error('DB error'));
      const res = await request(app)
        .get('/api/runners')
        .set('Authorization', `Bearer ${getValidToken()}`);
      
      expect(res.status).toBe(500);
      expect(res.body.error.message).toBe('DB error');
    });
  });

  describe('POST /api/runners', () => {
    it('should block non-admins', async () => {
      const res = await request(app)
        .post('/api/runners')
        .set('Authorization', `Bearer ${getValidToken('user-id')}`)
        .send({ name: 'R', url: 'http', psk: '123' });
      
      expect(res.status).toBe(403);
    });

    it('should validate inputs', async () => {
      const res = await request(app)
        .post('/api/runners')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R' }); // missing url and psk
      
      expect(res.status).toBe(400);
    });

    it('should create a runner', async () => {
      mockRunnerService.createRunner.mockResolvedValueOnce({ id: 'r1', name: 'R' });
      const res = await request(app)
        .post('/api/runners')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R', url: 'http', psk: '123' });
      
      expect(res.status).toBe(201);
      expect(res.body.data.id).toBe('r1');
    });

    it('should handle service errors', async () => {
      mockRunnerService.createRunner.mockRejectedValueOnce(new Error('err'));
      const res = await request(app)
        .post('/api/runners')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R', url: 'http', psk: '123' });
      
      expect(res.status).toBe(500);
    });
  });

  describe('PUT /api/runners/:id', () => {
    it('should update a runner', async () => {
      mockRunnerService.updateRunner.mockResolvedValueOnce({ id: 'r1', name: 'R2' });
      const res = await request(app)
        .put('/api/runners/r1')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R2' });
      
      expect(res.status).toBe(200);
      expect(res.body.data.name).toBe('R2');
    });

    it('should return 404 if not found', async () => {
      mockRunnerService.updateRunner.mockResolvedValueOnce(null);
      const res = await request(app)
        .put('/api/runners/r1')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R2' });
      
      expect(res.status).toBe(404);
    });

    it('should handle service errors', async () => {
      mockRunnerService.updateRunner.mockRejectedValueOnce(new Error('err'));
      const res = await request(app)
        .put('/api/runners/r1')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ name: 'R2' });
      
      expect(res.status).toBe(500);
    });
  });

  describe('DELETE /api/runners/:id', () => {
    it('should delete a runner', async () => {
      mockRunnerService.deleteRunner.mockResolvedValueOnce();
      const res = await request(app)
        .delete('/api/runners/r1')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`);
      
      expect(res.status).toBe(200);
    });

    it('should handle service errors', async () => {
      mockRunnerService.deleteRunner.mockRejectedValueOnce(new Error('err'));
      const res = await request(app)
        .delete('/api/runners/r1')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`);
      
      expect(res.status).toBe(500);
    });
  });

  describe('POST /api/runners/:id/run', () => {
    it('should validate module input', async () => {
      const res = await request(app)
        .post('/api/runners/r1/run')
        .set('Authorization', `Bearer ${getValidToken('user-id')}`)
        .send({}); // missing module
      
      expect(res.status).toBe(400);
    });

    it('should run a module on a host', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ status: 'ok' });
      const res = await request(app)
        .post('/api/runners/r1/run')
        .set('Authorization', `Bearer ${getValidToken('user-id')}`)
        .send({ module: 'mod1', args: [] });
      
      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe('ok');
    });

    it('should handle service errors', async () => {
      mockRunnerService.runModuleOnHost.mockRejectedValueOnce(new Error('err'));
      const res = await request(app)
        .post('/api/runners/r1/run')
        .set('Authorization', `Bearer ${getValidToken('user-id')}`)
        .send({ module: 'mod1' });
      
      expect(res.status).toBe(500);
    });
  });
});
