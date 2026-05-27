'use strict';

const passport   = require('../auth/passport');
const apiKeyAuth = require('./apiKeyAuth');

/**
 * Middleware: requires either a valid API key (X-API-Key) or JWT Bearer token.
 * Tries API key first, falls back to JWT.
 * Attaches req.user = { id, username, role }.
 */
function authenticate(req, res, next) {
  // First, try API key auth (non-blocking — it calls next() if no key)
  apiKeyAuth(req, res, (err) => {
    if (err) return next(err);

    // If API key auth succeeded, req.user is already set
    if (req.user) return next();

    // Fall back to JWT
    passport.authenticate('jwt', { session: false }, (jwtErr, user) => {
      if (jwtErr) return next(jwtErr);
      if (!user)  return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
      req.user = user;
      next();
    })(req, res, next);
  });
}

module.exports = authenticate;
