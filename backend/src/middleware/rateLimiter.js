const rateLimit = require('express-rate-limit');
const config = require('../config');

const skipIfTest = () => config.isTest();

// Key generator: tracks by req.user.id if authenticated, otherwise req.ip
const keyGenerator = (req, res) => {
  return req.user ? req.user.id : rateLimit.ipKeyGenerator(req, res);
};

// General API rate limiter (generous)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, 
  standardHeaders: true, 
  legacyHeaders: false, 
  skip: skipIfTest,
  keyGenerator,
  message: {
    error: 'Too many requests, please try again later.',
  },
});

// Heavy operations rate limiter (stricter for exports, bulk processing)
const heavyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 30, // Limit each user to 30 heavy ops per 15 mins
  standardHeaders: true, 
  legacyHeaders: false, 
  skip: skipIfTest,
  keyGenerator,
  message: {
    error: 'Too many heavy operations requested, please try again later.',
  },
});

// Stricter rate limiter for authentication routes
const authLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 20, 
  standardHeaders: true, 
  legacyHeaders: false, 
  skip: skipIfTest,
  keyGenerator,
  message: {
    error: 'Too many authentication attempts, please try again after an hour.',
  },
});

module.exports = {
  apiLimiter,
  heavyLimiter,
  authLimiter,
};
