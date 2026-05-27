'use strict';

process.env.NODE_ENV = 'test';

const { ProxyService, getProxyService, _resetProxyService } = require('../../src/services/proxyService');
const config = require('../../src/config');

describe('ProxyService Unit Tests', () => {
  beforeEach(() => {
    _resetProxyService();
  });

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const i1 = getProxyService();
      const i2 = getProxyService();
      expect(i1).toBe(i2);
      expect(i1).toBeInstanceOf(ProxyService);
    });
  });

  describe('getExecEnv', () => {
    it('returns empty object when mode is none', () => {
      config.proxyMode = 'none';
      config.proxyTarget = 'http://proxy:8080';
      const svc = new ProxyService();
      expect(svc.getExecEnv()).toEqual({});
    });

    it('returns empty object when target is not set', () => {
      config.proxyMode = 'hop';
      config.proxyTarget = '';
      const svc = new ProxyService();
      expect(svc.getExecEnv()).toEqual({});
    });

    it('returns proxy environment overrides when active', () => {
      config.proxyMode = 'hop';
      config.proxyTarget = 'http://proxy:8080';
      const svc = new ProxyService();
      
      const env = svc.getExecEnv();
      expect(env.HTTP_PROXY).toBe('http://proxy:8080');
      expect(env.HTTPS_PROXY).toBe('http://proxy:8080');
      expect(env.http_proxy).toBe('http://proxy:8080');
      expect(env.https_proxy).toBe('http://proxy:8080');
    });
  });

  describe('getInfo and _describe', () => {
    it('returns correct info for none mode', () => {
      config.proxyMode = 'none';
      config.proxyTarget = '';
      const svc = new ProxyService();
      
      const info = svc.getInfo();
      expect(info.mode).toBe('none');
      expect(info.target).toBeNull();
      expect(info.active).toBe(false);
      expect(info.description).toBe('All module execution is local.');
    });

    it('returns correct info for hop mode', () => {
      config.proxyMode = 'hop';
      config.proxyTarget = 'http://proxy';
      const svc = new ProxyService();
      
      const info = svc.getInfo();
      expect(info.mode).toBe('hop');
      expect(info.target).toBe('http://proxy');
      expect(info.active).toBe(true);
      expect(info.description).toBe('System B routes module traffic through http://proxy → Target.');
    });

    it('returns correct info for direct mode', () => {
      config.proxyMode = 'direct';
      config.proxyTarget = 'http://proxy';
      const svc = new ProxyService();
      
      const info = svc.getInfo();
      expect(info.mode).toBe('direct');
      expect(info.target).toBe('http://proxy');
      expect(info.active).toBe(true);
      expect(info.description).toBe('Module traffic routes directly via http://proxy → Target.');
    });

    it('returns empty description for unknown mode', () => {
      config.proxyMode = 'unknown';
      config.proxyTarget = 'http://proxy';
      const svc = new ProxyService();
      
      expect(svc._describe()).toBe('');
    });
  });
});
