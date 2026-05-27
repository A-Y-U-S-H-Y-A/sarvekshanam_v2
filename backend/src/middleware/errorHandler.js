'use strict';

/**
 * Global Express error handler.
 * Normalises errors into a consistent JSON envelope.
 */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${status} – ${message}`, err.stack ? `\n${err.stack}` : '');
  }

  res.status(status).json({
    success: false,
    error: {
      status,
      message,
      ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
    },
  });
}

module.exports = errorHandler;
