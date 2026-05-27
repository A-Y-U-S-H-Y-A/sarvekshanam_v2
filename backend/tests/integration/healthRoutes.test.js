'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const router  = require('../../src/routes/healthRoutes');

const app = express();
app.use(express.json());
app.use('/', router);

describe('Health Routes Integration Tests', () => {
  describe('GET /health', () => {
    it('returns 200 with expected shape', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe('ok');
      expect(res.body.data.service).toBe('Sarvekshanam');
      expect(typeof res.body.data.version).toBe('string');
      expect(typeof res.body.data.timestamp).toBe('string');
      expect(typeof res.body.data.uptime).toBe('number');
    });

    it('timestamp is a valid ISO string', async () => {
      const res = await request(app).get('/health');
      expect(() => new Date(res.body.data.timestamp)).not.toThrow();
      expect(new Date(res.body.data.timestamp).toISOString()).toBe(res.body.data.timestamp);
    });

    it('uptime is >= 0', async () => {
      const res = await request(app).get('/health');
      expect(res.body.data.uptime).toBeGreaterThanOrEqual(0);
    });
  });
});
