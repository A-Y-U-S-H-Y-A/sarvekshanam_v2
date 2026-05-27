'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

jest.mock('child_process', () => ({ exec: jest.fn() }));
jest.mock('../../src/services/vectorService', () => ({
  getVectorService: () => ({ ingest: jest.fn().mockResolvedValue() })
}));
const { exec } = require('child_process');

const request  = require('supertest');
const { createTestDb }             = require('../helpers/testDb');
const dbModule                     = require('../../src/db/database');
const { _resetScanSessionService } = require('../../src/services/scanSessionService');
const { _resetCommandService }     = require('../../src/services/commandService');
const { createApp }                = require('../../src/app');

let app, testDb, token;

async function register(username = 'alice', password = 'pass1234') {
  const res = await request(app).post('/auth/register').send({ username, password });
  return res.body.data.token;
}

async function makeAdmin(username) {
  await testDb.User.update({ role: 'admin' }, { where: { username } });
}

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetScanSessionService();
  _resetCommandService();
  app   = createApp();
  token = await register('alice');
  await makeAdmin('alice');
  exec.mockReset();
});

afterEach(() => {
  // No need to close the Sequelize connection between tests.
  // sync({ force: true }) in beforeEach resets all data.
});

describe('Scan routes', () => {
  describe('POST /api/scans', () => {
    it('creates a scan and returns 202 with sessionId', async () => {
      const res = await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      expect(res.status).toBe(202);
      expect(res.body.data.session.id).toBeDefined();
      expect(res.body.data.session.status).toBe('pending');
    });

    it('returns 400 when target is missing', async () => {
      const res = await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ moduleIds: ['nmap-quick-scan'] });
      expect(res.status).toBe(400);
    });

    it('returns 400 when moduleIds is missing', async () => {
      const res = await request(app)
        .post('/api/scans')
        .set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1' });
      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/scans').send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/scans', () => {
    it('lists sessions', async () => {
      await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      const res = await request(app).get('/api/scans').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.sessions.length).toBeGreaterThanOrEqual(1);
    });

    it('filters sessions by status', async () => {
      const res = await request(app).get('/api/scans?status=pending').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
    });
  });

  describe('GET /api/scans/:id', () => {
    it('returns session detail', async () => {
      const create = await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      const id  = create.body.data.session.id;
      const res = await request(app).get(`/api/scans/${id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);
      expect(res.body.data.session.id).toBe(id);
    });

    it('returns 404 for unknown session', async () => {
      const res = await request(app).get('/api/scans/unknown-id').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns 403 when another non-admin user tries to access session', async () => {
      // Create scan as alice (admin)
      const create = await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      const id = create.body.data.session.id;

      // Register bob as viewer (not admin)
      const bobToken = await register('bob_scan_get');
      const res = await request(app).get(`/api/scans/${id}`).set('Authorization', `Bearer ${bobToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('DELETE /api/scans/:id', () => {
    it('deletes a session', async () => {
      const create = await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      const id     = create.body.data.session.id;
      const res    = await request(app).delete(`/api/scans/${id}`).set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(200);

      const check = await request(app).get(`/api/scans/${id}`).set('Authorization', `Bearer ${token}`);
      expect(check.status).toBe(404);
    });

    it('returns 404 for unknown session on delete', async () => {
      const res = await request(app).delete('/api/scans/unknown-id').set('Authorization', `Bearer ${token}`);
      expect(res.status).toBe(404);
    });

    it('returns 403 when another non-admin user tries to delete session', async () => {
      const create = await request(app).post('/api/scans').set('Authorization', `Bearer ${token}`)
        .send({ target: '192.168.1.1', moduleIds: ['nmap-quick-scan'] });
      const id = create.body.data.session.id;

      const bobToken = await register('bob_scan_del');
      const res = await request(app).delete(`/api/scans/${id}`).set('Authorization', `Bearer ${bobToken}`);
      expect(res.status).toBe(403);
    });
  });
});
