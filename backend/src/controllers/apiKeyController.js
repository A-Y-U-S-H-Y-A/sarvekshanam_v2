'use strict';

const { sendSuccess, sendError, sendNotFound, sendForbidden } = require('../utils/responseHelper');

const asyncHandler = require('../utils/asyncHandler');

const crypto    = require('crypto');
const bcrypt    = require('bcryptjs');
const config    = require('../config');
const { getDb } = require('../db/database');

// POST /api/keys — Generate a new API key
exports.create = asyncHandler(async (req, res, next) => {
    const { name = 'Untitled Key', scopes = ['*'] } = req.body;
    const userId = req.user.id;

    const id     = crypto.randomUUID();
    const secret = crypto.randomBytes(32).toString('hex');
    const rawKey = `sarv_${id}_${secret}`;
    const keyHash = bcrypt.hashSync(secret, config.bcryptRounds);

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
  });

// GET /api/keys — List user's API keys
exports.list = asyncHandler(async (req, res, next) => {
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
  });

// DELETE /api/keys/:id — Revoke an API key
exports.revoke = asyncHandler(async (req, res, next) => {
    const { ApiKey } = getDb();
    const key = await ApiKey.findByPk(req.params.id);

    if (!key) {
      return sendNotFound(res, 'API key not found');
    }

    // Only the owner or an admin can revoke
    if (key.user_id !== req.user.id && req.user.role !== 'admin') {
      return sendForbidden(res, 'Not authorized to revoke this key');
    }

    if (key.revoked_at) {
      return sendError(res, 'Key already revoked');
    }

    await key.update({ revoked_at: new Date() });

    return sendSuccess(res, { message: 'API key revoked' });
  });
