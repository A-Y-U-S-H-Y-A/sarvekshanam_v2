'use strict';

const crypto = require('crypto');
const jwt    = require('jsonwebtoken');

/**
 * JWKS Manager
 *
 * Generates a signing keypair for master→slave JWT authentication.
 * Exposes the public key as a JWKS (JSON Web Key Set) endpoint.
 * Signs short-lived JWTs for each slave request.
 */
class JwksManager {
  constructor() {
    const fs = require('fs');
    const path = require('path');
    const keyPath = path.join(__dirname, '..', '..', '.jwks.json');

    if (fs.existsSync(keyPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
        this._publicKeyPem  = data.publicKey;
        this._privateKeyPem = data.privateKey;
        this._kid           = data.kid;
        this._jwk           = data.jwk;
        return;
      } catch (e) {
        console.warn('Failed to load .jwks.json, generating new keys...');
      }
    }

    // Generate RSA-2048 keypair on startup
    const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
      modulusLength: 2048,
      publicKeyEncoding:  { type: 'spki',  format: 'pem' },
      privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });

    this._publicKeyPem  = publicKey;
    this._privateKeyPem = privateKey;

    // Compute the JWK representation of the public key
    const pubKeyObj = crypto.createPublicKey(publicKey);
    const jwkExport = pubKeyObj.export({ format: 'jwk' });

    this._kid = crypto.randomUUID();
    this._jwk = {
      ...jwkExport,
      kid: this._kid,
      alg: 'RS256',
      use: 'sig',
    };

    fs.writeFileSync(keyPath, JSON.stringify({
      publicKey: this._publicKeyPem,
      privateKey: this._privateKeyPem,
      kid: this._kid,
      jwk: this._jwk
    }, null, 2));
  }

  /**
   * Returns the JWKS document containing the public signing key.
   * @returns {{ keys: object[] }}
   */
  getJwks() {
    return { keys: [this._jwk] };
  }

  /**
   * Get the Key ID for the current signing key.
   * @returns {string}
   */
  getKid() {
    return this._kid;
  }

  /**
   * Sign a short-lived JWT for authenticating a request to a slave node.
   * @param {object} payload — Custom claims (e.g. { runnerId, action })
   * @param {number} [expiresInSeconds=300] — Token lifetime (default 5 min)
   * @returns {string} Signed JWT
   */
  signSlaveToken(payload = {}, expiresInSeconds = 300) {
    return jwt.sign(
      {
        ...payload,
        iss: 'sarvekshanam-master',
        iat: Math.floor(Date.now() / 1000),
      },
      this._privateKeyPem,
      {
        algorithm: 'RS256',
        expiresIn: expiresInSeconds,
        keyid: this._kid,
      }
    );
  }

  /**
   * Verify a JWT signed by this instance (for testing).
   * @param {string} token
   * @returns {object} decoded payload
   */
  verifyToken(token) {
    return jwt.verify(token, this._publicKeyPem, { algorithms: ['RS256'] });
  }

  /**
   * Get the PEM-encoded public key.
   * @returns {string}
   */
  getPublicKeyPem() {
    return this._publicKeyPem;
  }
}

// ── Singleton ────────────────────────────────────────────────────────────────
let _instance = null;
function getJwksManager() {
  if (!_instance) _instance = new JwksManager();
  return _instance;
}

module.exports = { JwksManager, getJwksManager };
