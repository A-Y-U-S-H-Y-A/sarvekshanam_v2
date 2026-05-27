'use strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret';

const request = require('supertest');
const express = require('express');
const router = require('../../src/routes/settingsRoutes');
const jwt = require('jsonwebtoken');
const fs = require('fs');

// Mock proxyService
const mockProxyService = {
  getInfo: jest.fn().mockReturnValue({ mode: 'none', target: '' }),
  mode: 'none',
  target: ''
};

jest.mock('../../src/services/proxyService', () => ({
  getProxyService: () => mockProxyService
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
app.use('/api/settings', router);

function getValidToken(userId = 'user-id') {
  return jwt.sign({ id: userId }, process.env.JWT_SECRET, { expiresIn: '1h' });
}

describe('Settings Routes Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /api/settings/proxy', () => {
    it('should return proxy info', async () => {
      const res = await request(app)
        .get('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken()}`);
      
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.mode).toBe('none');
    });
  });

  describe('POST /api/settings/proxy', () => {
    it('should block non-admins', async () => {
      const res = await request(app)
        .post('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken('user-id')}`)
        .send({ mode: 'hop' });
      
      expect(res.status).toBe(403);
    });

    it('should validate mode', async () => {
      const res = await request(app)
        .post('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ mode: 'invalid' });
      
      expect(res.status).toBe(400);
      expect(res.body.error.message).toBe('Invalid proxy mode');
    });

    it('should update proxy mode and persist to .env if exists', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('PROXY_MODE=none\nPROXY_TARGET=');
      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      mockProxyService.getInfo.mockReturnValueOnce({ mode: 'hop', target: 'http://proxy' });

      const res = await request(app)
        .post('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ mode: 'hop', target: 'http://proxy' });
      
      expect(res.status).toBe(200);
      expect(mockProxyService.mode).toBe('hop');
      expect(mockProxyService.target).toBe('http://proxy');
      expect(res.body.data.mode).toBe('hop');
      expect(writeSpy).toHaveBeenCalled();
    });

    it('should update proxy mode and append to .env if PROXY_TARGET missing', async () => {
      jest.spyOn(fs, 'existsSync').mockReturnValue(true);
      jest.spyOn(fs, 'readFileSync').mockReturnValue('PROXY_MODE=none');
      const writeSpy = jest.spyOn(fs, 'writeFileSync').mockImplementation(() => {});

      const res = await request(app)
        .post('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ mode: 'hop', target: 'http://proxy2' });
      
      expect(res.status).toBe(200);
      expect(writeSpy).toHaveBeenCalled();
      const writtenContent = writeSpy.mock.calls[0][1];
      expect(writtenContent).toContain('PROXY_TARGET=http://proxy2');
    });

    it('should handle fs errors gracefully', async () => {
      jest.spyOn(fs, 'existsSync').mockImplementation(() => { throw new Error('fs error'); });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const res = await request(app)
        .post('/api/settings/proxy')
        .set('Authorization', `Bearer ${getValidToken('admin-id')}`)
        .send({ mode: 'direct' });
      
      expect(res.status).toBe(200);
      expect(consoleSpy).toHaveBeenCalledWith('Failed to update .env', expect.any(Error));
      
      consoleSpy.mockRestore();
    });
  });
});
