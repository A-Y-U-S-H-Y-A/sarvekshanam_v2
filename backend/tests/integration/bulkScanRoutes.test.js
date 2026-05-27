'use strict';

process.env.NODE_ENV   = 'test';
process.env.JWT_SECRET = 'test-secret';

jest.mock('child_process', () => ({ exec: jest.fn() }));
jest.mock('../../src/services/vectorService', () => ({
  getVectorService: () => ({ ingest: jest.fn().mockResolvedValue() })
}));

const request  = require('supertest');
const { createTestDb }             = require('../helpers/testDb');
const dbModule                     = require('../../src/db/database');
const { _resetScanSessionService } = require('../../src/services/scanSessionService');
const { _resetCommandService }     = require('../../src/services/commandService');
const { createApp }                = require('../../src/app');

let app, testDb, token, apptId;

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetScanSessionService();
  _resetCommandService();
  app = createApp();
  const res = await request(app).post('/auth/register').send({ username: 'alice', password: 'pass1234' });
  token = res.body.data.token;

  const mockUser = await testDb.User.create({ id: 'mock-user-1', username: 'appt-owner', password_hash: 'hash' });
  const appt = await testDb.Appointment.create({
    id: 'mock-uuid-appt',
    name: 'Test Appt',
    mode: 'manual',
    user_id: mockUser.id
  });
  apptId = appt.id;
});

afterEach(() => {
  // No need to close the Sequelize connection between tests.
  // sync({ force: true }) in beforeEach resets all data.
});

describe('Bulk scan routes', () => {
  describe('POST /api/scans/bulk', () => {
    it('creates one session per target', async () => {
      const res = await request(app)
        .post('/api/scans/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({ targets: ['192.168.1.1', '192.168.1.2', '10.0.0.1'], moduleIds: ['nmap-quick-scan'], appointmentId: apptId });

      expect(res.status).toBe(202);
      expect(res.body.data.count).toBe(3);
      expect(res.body.data.sessions).toHaveLength(3);
      res.body.data.sessions.forEach(s => {
        expect(s.mode).toBe('bulk');
        expect(s.status).toBe('pending');
      });
    });

    it('returns 400 when targets is empty', async () => {
      const res = await request(app)
        .post('/api/scans/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({ targets: [], moduleIds: ['nmap-quick-scan'], appointmentId: apptId });
      expect(res.status).toBe(400);
    });

    it('returns 400 when moduleIds is missing', async () => {
      const res = await request(app)
        .post('/api/scans/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({ targets: ['192.168.1.1'], appointmentId: apptId });
      expect(res.status).toBe(400);
    });

    it('returns 401 without token', async () => {
      const res = await request(app)
        .post('/api/scans/bulk')
        .send({ targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'], appointmentId: apptId });
      expect(res.status).toBe(401);
    });

    it('accepts optional name and params', async () => {
      const res = await request(app)
        .post('/api/scans/bulk')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name:      'Bulk Test Scan',
          targets:   ['192.168.1.1', '192.168.1.2'],
          moduleIds: ['nmap-port-scan'],
          params:    { 'nmap-port-scan': { ports: '80,443', timing: 'T4' } },
          appointmentId: apptId
        });
      expect(res.status).toBe(202);
      expect(res.body.data.sessions[0].name).toContain('Bulk Test Scan');
    });
  });
});
