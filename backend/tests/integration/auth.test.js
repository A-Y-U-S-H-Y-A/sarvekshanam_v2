'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request  = require('supertest');
const { createTestDb } = require('../helpers/testDb');
const dbModule         = require('../../src/db/database');
const { _resetScanSessionService } = require('../../src/services/scanSessionService');
const { _resetCommandService }     = require('../../src/services/commandService');
const { createApp }                = require('../../src/app');

let app, testDb;

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetScanSessionService();
  _resetCommandService();
  app = createApp();
});

afterEach(() => {
  // No need to close the Sequelize connection between tests.
  // sync({ force: true }) in beforeEach resets all data.
});

describe('Auth routes', () => {
  describe('POST /auth/register', () => {
    it('registers a new user and returns token', async () => {
      const res = await request(app)
        .post('/auth/register')
        .send({ username: 'alice', password: 'password123' });
      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.token).toBeDefined();
      expect(res.body.data.user.role).toBe('viewer');
    });

    it('rejects missing fields', async () => {
      const res = await request(app).post('/auth/register').send({ username: 'alice' });
      expect(res.status).toBe(400);
    });

    it('rejects short username', async () => {
      const res = await request(app).post('/auth/register').send({ username: 'ab', password: 'password123' });
      expect(res.status).toBe(400);
    });

    it('rejects short password', async () => {
      const res = await request(app).post('/auth/register').send({ username: 'alice', password: '123' });
      expect(res.status).toBe(400);
    });

    it('rejects duplicate usernames', async () => {
      await request(app).post('/auth/register').send({ username: 'alice', password: 'password123' });
      const res = await request(app).post('/auth/register').send({ username: 'alice', password: 'password123' });
      expect(res.status).toBe(409);
    });
  });

  describe('POST /auth/login', () => {
    beforeEach(async () => {
      await request(app).post('/auth/register').send({ username: 'alice', password: 'password123' });
    });

    it('returns token with valid credentials', async () => {
      const res = await request(app).post('/auth/login').send({ username: 'alice', password: 'password123' });
      expect(res.status).toBe(200);
      expect(res.body.data.token).toBeDefined();
    });

    it('rejects wrong password', async () => {
      const res = await request(app).post('/auth/login').send({ username: 'alice', password: 'wrongpass' });
      expect(res.status).toBe(401);
    });

    it('rejects unknown user', async () => {
      const res = await request(app).post('/auth/login').send({ username: 'nobody', password: 'password123' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /auth/me', () => {
    it('returns user for valid token', async () => {
      const reg = await request(app).post('/auth/register').send({ username: 'alice', password: 'password123' });
      const token = reg.body.data.token;

      const res = await request(app).get('/auth/me').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.user.username).toBe('alice');
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/auth/me');
      expect(res.status).toBe(401);
    });
  });
});
