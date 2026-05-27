'use strict';

const router = require('express').Router();
const { getJwksManager } = require('../auth/jwks');

// GET /api/.well-known/jwks.json — Public JWKS endpoint
router.get('/jwks.json', (req, res) => {
  const jwks = getJwksManager().getJwks();
  res.json(jwks);
});

module.exports = router;
