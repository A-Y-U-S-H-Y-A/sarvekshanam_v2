'use strict';

process.env.NODE_ENV         = 'test';
process.env.JWT_SECRET       = 'test-secret';
process.env.ALLOWED_COMMANDS = '*';

jest.mock('child_process', () => ({ exec: jest.fn() }));
const { exec } = require('child_process');

const request  = require('supertest');
const { createTestDb }             = require('../helpers/testDb');
const dbModule                     = require('../../src/db/database');
const { _resetScanSessionService } = require('../../src/services/scanSessionService');
const { _resetCommandService }     = require('../../src/services/commandService');
const { createApp }                = require('../../src/app');

let app, testDb, userToken, adminToken;

async function register(username, password = 'pass1234') {
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
  app       = createApp();
  userToken  = await register('alice');
  adminToken = await register('bob');
  await makeAdmin('bob');
  // Fresh token after role change
  const loginRes = await request(app).post('/auth/login').send({ username: 'bob', password: 'pass1234' });
  adminToken = loginRes.body.data.token;
  exec.mockReset();
});

afterEach(() => {
  // No need to close the Sequelize connection between tests.
  // sync({ force: true }) in beforeEach resets all data.
});

describe('Command routes', () => {
  describe('POST /api/commands', () => {
    it('submits a command and returns pending status', async () => {
      const res = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ command: 'ping -c 4 8.8.8.8' });
      expect(res.status).toBe(202);
      expect(res.body.data.command.status).toBe('pending');
    });

    it('returns 400 for empty command', async () => {
      const res = await request(app)
        .post('/api/commands')
        .set('Authorization', `Bearer ${userToken}`)
        .send({ command: '' });
      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).post('/api/commands').send({ command: 'ping 8.8.8.8' });
      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/commands', () => {
    it('user sees only their own commands', async () => {
      await request(app).post('/api/commands').set('Authorization', `Bearer ${userToken}`).send({ command: 'ping 1.1.1.1' });
      await request(app).post('/api/commands').set('Authorization', `Bearer ${adminToken}`).send({ command: 'ping 2.2.2.2' });
      const res = await request(app).get('/api/commands').set('Authorization', `Bearer ${userToken}`);
      expect(res.body.data.total).toBe(1);
    });

    it('admin sees all commands', async () => {
      await request(app).post('/api/commands').set('Authorization', `Bearer ${userToken}`).send({ command: 'ping 1.1.1.1' });
      await request(app).post('/api/commands').set('Authorization', `Bearer ${adminToken}`).send({ command: 'ping 2.2.2.2' });
      const res = await request(app).get('/api/commands').set('Authorization', `Bearer ${adminToken}`);
      expect(res.body.data.total).toBe(2);
    });
  });

  describe('POST /api/commands/:id/approve', () => {
    it('admin can approve and execute a command', async () => {
      exec.mockImplementation((cmd, opts, cb) => cb(null, 'PONG', ''));
      const submit = await request(app)
        .post('/api/commands').set('Authorization', `Bearer ${userToken}`).send({ command: 'ping 8.8.8.8' });
      const id = submit.body.data.command.id;

      const res = await request(app).post(`/api/commands/${id}/approve`).set('Authorization', `Bearer ${adminToken}`);
      expect(res.status).toBe(200);
      expect(res.body.data.command.status).toBe('executed');
      expect(res.body.data.command.output).toBe('PONG');
    });

    it('non-admin cannot approve', async () => {
      const submit = await request(app)
        .post('/api/commands').set('Authorization', `Bearer ${userToken}`).send({ command: 'ping 8.8.8.8' });
      const id = submit.body.data.command.id;
      const res = await request(app).post(`/api/commands/${id}/approve`).set('Authorization', `Bearer ${userToken}`);
      expect(res.status).toBe(403);
    });
  });

  describe('POST /api/commands/:id/reject', () => {
    it('admin can reject a command with reason', async () => {
      const submit = await request(app)
        .post('/api/commands').set('Authorization', `Bearer ${userToken}`).send({ command: 'ping 8.8.8.8' });
      const id = submit.body.data.command.id;

      const res = await request(app).post(`/api/commands/${id}/reject`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ reason: 'Not permitted right now' });
      expect(res.status).toBe(200);
      expect(res.body.data.command.status).toBe('rejected');
      expect(res.body.data.command.reason).toBe('Not permitted right now');
    });
  });
});
