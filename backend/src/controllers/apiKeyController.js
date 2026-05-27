'use strict';

const crypto    = require('crypto');
const { getDb } = require('../db/database');

// POST /api/keys — Generate a new API key
exports.create = async (req, res, next) => {
  try {
    const { name = 'Untitled Key', scopes = ['*'] } = req.body;
    const userId = req.user.id;

    const id     = crypto.randomUUID();
    const rawKey = `sarv_${crypto.randomBytes(32).toString('hex')}`;
    const keyHash = crypto.createHash('sha256').update(rawKey).digest('hex');

    const { ApiKey } = getDb();
    await ApiKey.create({
      id,
      user_id: userId,
      key_hash: keyHash,
      name,
      scopes_json: JSON.stringify(scopes),
    });

    // Return the raw key ONLY on creation — never again
    return res.status(201).json({
      success: true,
      data: {
        id,
        name,
        key: rawKey,
        scopes,
        created_at: new Date().toISOString(),
      },
    });
  } catch (err) {
    next(err);
  }
};

// GET /api/keys — List user's API keys
exports.list = async (req, res, next) => {
  try {
    const { ApiKey } = getDb();
    const keys = await ApiKey.findAll({
      where: { user_id: req.user.id },
      attributes: ['id', 'name', 'scopes_json', 'last_used_at', 'created_at', 'revoked_at'],
      order: [['created_at', 'DESC']],
    });

    return res.json({
      success: true,
      data: keys.map(k => ({
        id:           k.id,
        name:         k.name,
        scopes:       k.scopes_json,
        last_used_at: k.last_used_at,
        created_at:   k.created_at,
        revoked_at:   k.revoked_at,
      })),
    });
  } catch (err) {
    next(err);
  }
};

// DELETE /api/keys/:id — Revoke an API key
exports.revoke = async (req, res, next) => {
  try {
    const { ApiKey } = getDb();
    const key = await ApiKey.findByPk(req.params.id);

    if (!key) {
      return res.status(404).json({ success: false, error: { message: 'API key not found' } });
    }

    // Only the owner or an admin can revoke
    if (key.user_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: { message: 'Not authorized to revoke this key' } });
    }

    if (key.revoked_at) {
      return res.status(400).json({ success: false, error: { message: 'Key already revoked' } });
    }

    await key.update({ revoked_at: new Date() });

    return res.json({ success: true, data: { message: 'API key revoked' } });
  } catch (err) {
    next(err);
  }
};
