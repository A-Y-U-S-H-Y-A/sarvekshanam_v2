'use strict';

const { getCryptoService } = require('../../src/services/cryptoService');

describe('CryptoService Unit Tests', () => {
  let cryptoService;

  beforeEach(() => {
    cryptoService = getCryptoService();
    // clear cache
    cryptoService._pubkeyCache.clear();
  });

  it('should generate a keypair successfully', () => {
    const keys = cryptoService.generateKeyPair();
    expect(keys).toHaveProperty('publicKey');
    expect(keys).toHaveProperty('privateKey');
    expect(keys.publicKey).toContain('BEGIN PUBLIC KEY');
    expect(keys.privateKey).toContain('BEGIN PRIVATE KEY');
  });

  it('should cache, get and evict public keys', () => {
    const runnerId = 'runner-123';
    const fakePem = '-----BEGIN PUBLIC KEY-----\nFAKE\n-----END PUBLIC KEY-----';
    
    expect(cryptoService.getPublicKey(runnerId)).toBeNull();
    
    cryptoService.cachePublicKey(runnerId, fakePem);
    expect(cryptoService.getPublicKey(runnerId)).toBe(fakePem);
    
    cryptoService.evictPublicKey(runnerId);
    expect(cryptoService.getPublicKey(runnerId)).toBeNull();
  });

  it('should encrypt and decrypt payloads', () => {
    const keys = cryptoService.generateKeyPair();
    const runnerId = 'runner-456';
    const plaintext = 'super-secret-args';

    // Try to encrypt without cached key
    expect(() => cryptoService.encryptForSlave(runnerId, plaintext)).toThrow(/No public key cached/);

    cryptoService.cachePublicKey(runnerId, keys.publicKey);

    const ciphertext = cryptoService.encryptForSlave(runnerId, plaintext);
    expect(ciphertext).toBeDefined();
    expect(ciphertext).not.toBe(plaintext);

    const decrypted = cryptoService.decrypt(keys.privateKey, ciphertext);
    expect(decrypted).toBe(plaintext);
  });
});
