'use strict';

const bcrypt    = require('bcryptjs');
const { getDb } = require('../db/database');

/**
 * Middleware: authenticate via X-API-Key header.
 *
 * Hashes the provided key with SHA-256 and looks up the matching ApiKey record.
 * If found and not revoked, attaches req.user from the associated User record.
 * Also updates last_used_at on the key.
 *
 * This middleware does NOT reject — if no key is present or invalid,
 * it simply calls next() so the regular JWT auth can take over.
 */
async function apiKeyAuth(req, res, next) {
  const rawKey = req.headers['x-api-key'];
  if (!rawKey) return next();

  try {
    const parts = rawKey.split('_');
    if (parts.length !== 3 || parts[0] !== 'sarv') return next();
    
    const [_, id, secret] = parts;
    const { ApiKey, User } = getDb();

    const apiKey = await ApiKey.findByPk(id);
    if (!apiKey) return next();                              // no match → fall through

    // Verify secret
    const isValid = bcrypt.compareSync(secret, apiKey.key_hash);
    if (!isValid) return next();
    if (apiKey.revoked_at) {
      return res.status(401).json({
        success: false,
        error: { message: 'API key has been revoked' },
      });
    }

    // Look up the owning user
    const user = await User.findByPk(apiKey.user_id, {
      attributes: ['id', 'username', 'role'],
    });
    if (!user) return next();

    // Mark last used (fire-and-forget)
    apiKey.update({ last_used_at: new Date() }).catch(() => {});

    req.user = { id: user.id, username: user.username, role: user.role };
    req.apiKey = { id: apiKey.id, name: apiKey.name, scopes: apiKey.scopes_json };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = apiKeyAuth;
