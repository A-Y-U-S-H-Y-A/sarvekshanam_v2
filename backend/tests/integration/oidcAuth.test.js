'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const jwt     = require('jsonwebtoken');

// Mock passport so we control auth outcomes without real OIDC/local strategies
jest.mock('../../src/auth/passport', () => {
  const mockPassport = {
    use:          jest.fn(),
    authenticate: jest.fn(),
    initialize:   jest.fn(() => (req, res, next) => next()),
  };
  return mockPassport;
});

// Shared mock User model so mockResolvedValueOnce works across calls
const mockUserModel = {
  findOne:  jest.fn(),
  findByPk: jest.fn(),
  create:   jest.fn()
};

jest.mock('../../src/db/database', () => ({
  getDb: () => ({ User: mockUserModel })
}));

// Mock runnerService (required by app.js side-effect)
jest.mock('../../src/services/runnerService', () => ({
  getRunnerService: () => ({ startPolling: jest.fn() })
}));

const passport      = require('../../src/auth/passport');
const authRoutes    = require('../../src/auth/authRoutes');
const errorHandler  = require('../../src/middleware/errorHandler');

const mockUser = { id: 'u1', username: 'alice', role: 'viewer' };

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);
app.use(errorHandler);

describe('OIDC Auth Integration Tests', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('GET /auth/oidc/status', () => {
    it('returns enabled: false when OIDC not configured', async () => {
      const res = await request(app).get('/auth/oidc/status');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.enabled).toBe(false);
    });
  });

  describe('GET /auth/oidc — when OIDC disabled', () => {
    it('returns 404', async () => {
      const res = await request(app).get('/auth/oidc');
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe('GET /auth/oidc/callback — when OIDC disabled', () => {
    it('returns 404', async () => {
      const res = await request(app).get('/auth/oidc/callback');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /auth/register', () => {
    it('returns 400 if username missing', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ password: 'password123' });
      expect(res.status).toBe(400);
    });

    it('returns 400 if password too short', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ username: 'alice', password: 'abc' });
      expect(res.status).toBe(400);
    });

    it('returns 409 if username already taken', async () => {
      mockUserModel.findOne.mockResolvedValueOnce({ id: 'u2' });
      const res = await request(app)
        .post('/auth/register')
        .send({ username: 'alice', password: 'password123' });
      expect(res.status).toBe(409);
    });

    it('registers new user and returns token', async () => {
      mockUserModel.findOne.mockResolvedValueOnce(null);
      mockUserModel.create.mockResolvedValueOnce({ id: 'u1', username: 'alice', role: 'viewer' });

      const res = await request(app)
        .post('/auth/register')
        .send({ username: 'alice', password: 'password123' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.user.username).toBe('alice');
    });
  });

  describe('POST /auth/login', () => {
    it('returns JWT on successful login', async () => {
      passport.authenticate.mockImplementation(() => (req, res, next) => {
        res.json({ success: true, data: { token: 'mock-jwt', user: mockUser } });
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'alice', password: 'password123' });

      expect(res.status).toBe(200);
    });

    it('returns 401 on bad credentials', async () => {
      passport.authenticate.mockImplementation(() => (req, res, next) => {
        res.status(401).json({ success: false, error: { message: 'Invalid username or password' } });
      });

      const res = await request(app)
        .post('/auth/login')
        .send({ username: 'alice', password: 'wrong' });

      expect(res.status).toBe(401);
    });
  });

  describe('POST /auth/logout', () => {
    it('returns success message', async () => {
      const res = await request(app).post('/auth/logout');
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.message).toMatch(/logged out/i);
    });
  });

  describe('GET /auth/me', () => {
    it('returns 401 if not authenticated', async () => {
      passport.authenticate.mockImplementation(() => (req, res, next) => {
        res.status(401).json({ success: false, error: { message: 'Unauthorized' } });
      });

      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
    });

    it('returns user profile when authenticated', async () => {
      passport.authenticate.mockImplementation(() => async (req, res, next) => {
        mockUserModel.findByPk.mockResolvedValue(mockUser);
        req.user = mockUser;
        res.json({ success: true, data: { user: mockUser } });
      });

      const res = await request(app)
        .get('/auth/me')
        .set('Authorization', `Bearer ${jwt.sign({ id: 'u1' }, 'test-secret')}`);

      expect(res.status).toBe(200);
    });
  });
});
