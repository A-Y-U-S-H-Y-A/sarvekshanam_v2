'use strict';

const { getJwksManager } = require('../../src/auth/jwks');

describe('JwksManager Unit Tests', () => {
  let jwksManager;

  beforeAll(() => {
    jwksManager = getJwksManager();
  });

  it('should generate a JWKS document', () => {
    const jwks = jwksManager.getJwks();
    expect(jwks).toBeDefined();
    expect(jwks.keys).toBeInstanceOf(Array);
    expect(jwks.keys.length).toBe(1);
    expect(jwks.keys[0]).toHaveProperty('kty', 'RSA');
    expect(jwks.keys[0]).toHaveProperty('use', 'sig');
    expect(jwks.keys[0]).toHaveProperty('alg', 'RS256');
    expect(jwks.keys[0]).toHaveProperty('kid', jwksManager.getKid());
  });

  it('should return public key pem', () => {
    const pem = jwksManager.getPublicKeyPem();
    expect(pem).toContain('BEGIN PUBLIC KEY');
  });

  it('should sign and verify slave tokens', () => {
    const payload = { runnerId: 'test-runner', action: 'execute' };
    const token = jwksManager.signSlaveToken(payload, 300);

    expect(typeof token).toBe('string');
    expect(token.split('.').length).toBe(3);

    const decoded = jwksManager.verifyToken(token);
    expect(decoded).toBeDefined();
    expect(decoded.runnerId).toBe('test-runner');
    expect(decoded.action).toBe('execute');
    expect(decoded.iss).toBe('sarvekshanam-master');
  });
});
