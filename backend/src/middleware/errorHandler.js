'use strict';

/**
 * Global Express error handler.
 * Normalises errors into a consistent JSON envelope.
 */
function errorHandler(err, req, res, _next) {
  const status  = err.status || err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  if (process.env.NODE_ENV !== 'test') {
    console.error(`[ERROR] ${status} – ${message}`, err.stack ? `\n${err.stack}` : '');
  }

  const responseMessage = (process.env.NODE_ENV === 'production' && status === 500)
    ? 'Internal Server Error'
    : message;

  res.status(status).json({
    success: false,
    error: {
      status,
      message: responseMessage,
      ...(process.env.NODE_ENV === 'development' && err.stack ? { stack: err.stack } : {}),
    },
  });
}

module.exports = errorHandler;
