'use strict';

const crypto = require('crypto');

/**
 * CryptoService
 *
 * Handles asymmetric encryption for secure master→slave communication.
 * - Caches slave public keys fetched from their /pubkey endpoints
 * - Encrypts sensitive payloads with RSA-OAEP before sending to slaves
 */
class CryptoService {
  constructor() {
    /** @type {Map<string, { pem: string, importedAt: number }>} */
    this._pubkeyCache = new Map();
  }

  /**
   * Cache a slave's PEM-encoded public key.
   * @param {string} runnerId
   * @param {string} pemPublicKey  — PEM-encoded RSA public key
   */
  cachePublicKey(runnerId, pemPublicKey) {
    this._pubkeyCache.set(runnerId, {
      pem: pemPublicKey,
      importedAt: Date.now(),
    });
  }

  /**
   * Get cached public key for a runner.
   * @param {string} runnerId
   * @returns {string|null} PEM string or null
   */
  getPublicKey(runnerId) {
    const entry = this._pubkeyCache.get(runnerId);
    return entry ? entry.pem : null;
  }

  /**
   * Remove a cached key (e.g. on runner deletion).
   * @param {string} runnerId
   */
  evictPublicKey(runnerId) {
    this._pubkeyCache.delete(runnerId);
  }

  /**
   * Encrypt a plaintext string for a specific slave using its cached RSA public key.
   * Uses RSA-OAEP with SHA-256.
   *
   * @param {string} runnerId
   * @param {string} plaintext
   * @returns {string} Base64-encoded ciphertext
   * @throws {Error} If no public key is cached for the runner
   */
  encryptForSlave(runnerId, plaintext) {
    const entry = this._pubkeyCache.get(runnerId);
    if (!entry) {
      throw new Error(`No public key cached for runner ${runnerId}`);
    }

    const buffer = Buffer.from(plaintext, 'utf-8');
    const encrypted = crypto.publicEncrypt(
      {
        key: entry.pem,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );

    return encrypted.toString('base64');
  }

  /**
   * Decrypt ciphertext using a private key (for testing / local scenarios).
   * @param {string} pemPrivateKey — PEM-encoded RSA private key
   * @param {string} base64Ciphertext
   * @returns {string} decrypted plaintext
   */
  decrypt(pemPrivateKey, base64Ciphertext) {
    const buffer = Buffer.from(base64Ciphertext, 'base64');
    const decrypted = crypto.privateDecrypt(
      {
        key: pemPrivateKey,
        padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
        oaepHash: 'sha256',
      },
      buffer
    );
    return decrypted.toString('utf-8');
  }

  /**
   * Generate an RSA-2048 keypair (useful for testing or local slave emulation).
   * @returns {{ publicKey: string, privateKey: string }} PEM-encoded keys
   */
  generateKeyPair() {
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
    return { publicKey, privateKey };
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
let _instance = null;
function getCryptoService() {
  if (!_instance) _instance = new CryptoService();
  return _instance;
}

module.exports = { CryptoService, getCryptoService };
