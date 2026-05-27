'use strict';

const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const passport = require('./passport');
const config   = require('../config');
const { getDb } = require('../db/database');

const router = express.Router();

// ── POST /auth/register ──────────────────────────────────────────────────────
router.post('/register', async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, error: { message: 'username and password are required' } });
    }
    if (username.length < 3) {
      return res.status(400).json({ success: false, error: { message: 'username must be at least 3 characters' } });
    }
    if (password.length < 6) {
      return res.status(400).json({ success: false, error: { message: 'password must be at least 6 characters' } });
    }

    const { User } = getDb();
    const existing = await User.findOne({ where: { username } });
    if (existing) {
      return res.status(409).json({ success: false, error: { message: 'Username already taken' } });
    }

    const id            = require('crypto').randomUUID();
    const password_hash = bcrypt.hashSync(password, config.bcryptRounds);

    await User.create({
      id,
      username,
      password_hash,
      role: 'viewer'
    });

    const token = jwt.sign({ id, username, role: 'viewer' }, config.jwtSecret, {
      expiresIn: config.jwtExpiresIn,
    });

    return res.status(201).json({
      success: true,
      data: { token, user: { id, username, role: 'viewer' } },
    });
  } catch (err) {
    next(err);
  }
});

// ── POST /auth/login ─────────────────────────────────────────────────────────
router.post('/login', (req, res, next) => {
  passport.authenticate('local', { session: false }, (err, user, info) => {
    if (err)   return next(err);
    if (!user) return res.status(401).json({ success: false, error: { message: info?.message || 'Unauthorized' } });

    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.json({ success: true, data: { token, user } });
  })(req, res, next);
});

// ── GET /auth/me ─────────────────────────────────────────────────────────────
router.get('/me', (req, res, next) => {
  passport.authenticate('jwt', { session: false }, async (err, user) => {
    if (err)   return next(err);
    if (!user) return res.status(401).json({ success: false, error: { message: 'Unauthorized' } });

    try {
      const { User } = getDb();
      const fresh = await User.findByPk(user.id, {
        attributes: ['id', 'username', 'role', 'created_at']
      });
      return res.json({ success: true, data: { user: fresh } });
    } catch (e) {
      return next(e);
    }
  })(req, res, next);
});

// ── POST /auth/logout ────────────────────────────────────────────────────────
// Stateless JWT — client simply discards token. Endpoint for UX completeness.
router.post('/logout', (req, res) => {
  res.json({ success: true, data: { message: 'Logged out. Discard your token client-side.' } });
});

// ── GET /auth/oidc/status ────────────────────────────────────────────────────
// Returns whether OIDC is configured — frontend uses this to show/hide SSO button
router.get('/oidc/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: config.oidcEnabled && !!config.oidcIssuer,
      issuer:  config.oidcEnabled ? config.oidcIssuer : null,
    },
  });
});

// ── GET /auth/oidc ───────────────────────────────────────────────────────────
// Initiates OIDC SSO flow (redirects to IdP)
router.get('/oidc', (req, res, next) => {
  if (!config.oidcEnabled) {
    return res.status(404).json({ success: false, error: { message: 'OIDC is not configured' } });
  }
  passport.authenticate('oidc')(req, res, next);
});

// ── GET /auth/oidc/callback ──────────────────────────────────────────────────
// IdP redirects back here after authentication
router.get('/oidc/callback', (req, res, next) => {
  if (!config.oidcEnabled) {
    return res.status(404).json({ success: false, error: { message: 'OIDC is not configured' } });
  }

  passport.authenticate('oidc', { session: false, failureRedirect: `${config.frontendUrl}?oidc_error=auth_failed` }, (err, user) => {
    if (err)   return next(err);
    if (!user) return res.redirect(`${config.frontendUrl}?oidc_error=auth_failed`);

    // Issue JWT and redirect to frontend with token
    const token = jwt.sign(
      { id: user.id, username: user.username, role: user.role },
      config.jwtSecret,
      { expiresIn: config.jwtExpiresIn }
    );

    return res.redirect(`${config.frontendUrl}?oidc_token=${token}`);
  })(req, res, next);
});

module.exports = router;
