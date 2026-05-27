'use strict';

process.env.NODE_ENV = 'test';

const request = require('supertest');
const express = require('express');
const router  = require('../../src/routes/jwksRoutes');

const mockJwks = {
  keys: [
    {
      kty: 'RSA',
      kid: 'test-key-1',
      use: 'sig',
      alg: 'RS256',
      n:   'testModulus',
      e:   'AQAB'
    }
  ]
};

jest.mock('../../src/auth/jwks', () => ({
  getJwksManager: () => ({
    getJwks: jest.fn().mockReturnValue(mockJwks)
  })
}));

const app = express();
app.use(express.json());
app.use('/', router);

describe('JWKS Routes Integration Tests', () => {
  describe('GET /jwks.json', () => {
    it('returns 200 with a JWK set', async () => {
      const res = await request(app).get('/jwks.json');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('keys');
      expect(Array.isArray(res.body.keys)).toBe(true);
    });

    it('each key has required JWK fields', async () => {
      const res = await request(app).get('/jwks.json');

      const key = res.body.keys[0];
      expect(key).toHaveProperty('kty');
      expect(key).toHaveProperty('kid');
      expect(key).toHaveProperty('alg');
      expect(key).toHaveProperty('use');
    });

    it('is publicly accessible without auth', async () => {
      // No Authorization header — must still return 200
      const res = await request(app).get('/jwks.json');
      expect(res.status).toBe(200);
    });
  });
});
