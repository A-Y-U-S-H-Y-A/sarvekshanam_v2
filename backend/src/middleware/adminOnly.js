'use strict';

/**
 * Middleware: requires req.user.role === 'admin'.
 * Must be used AFTER authenticate middleware.
 */
function adminOnly(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: { message: 'Authentication required' } });
  }
  if (req.user.role !== 'admin') {
    return res.status(403).json({ success: false, error: { message: 'Admin access required' } });
  }
  next();
}

module.exports = adminOnly;
