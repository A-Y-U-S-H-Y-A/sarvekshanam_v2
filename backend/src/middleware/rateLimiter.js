const rateLimit = require('express-rate-limit');
const config = require('../config');

const skipIfTest = () => config.isTest();

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: skipIfTest,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

// Stricter rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, // Limit each IP to 20 requests per `window` (here, per hour)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
  skip: skipIfTest,
  message: {
    error: 'Too many authentication attempts, please try again after an hour.',
  },
});

module.exports = {
  apiLimiter,
  authLimiter,
};
