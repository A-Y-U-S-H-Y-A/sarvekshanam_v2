'use strict';

const express         = require('express');
const cors            = require('cors');
const morgan          = require('morgan');
const path            = require('path');
const swaggerUi       = require('swagger-ui-express');
const yaml            = require('js-yaml');
const fs              = require('fs');
const config          = require('./config');
const apiRoutes       = require('./routes');
const authRoutes      = require('./auth/authRoutes');
const errorHandler    = require('./middleware/errorHandler');
const { apiLimiter, authLimiter } = require('./middleware/rateLimiter');

const { getRunnerService }  = require('./services/runnerService');

// Initialise Passport (side-effect: registers strategies)
require('./auth/passport');


// Start Remote Runner Polling
getRunnerService().startPolling();

function createApp() {
  const app = express();

  // ── CORS ──────────────────────────────────────────────────────────────────
  app.use(cors({
    origin: function (requestOrigin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!requestOrigin) return callback(null, true);
      
      // If wildcard is in allowed origins, allow the request with a literal '*'
      if (config.corsOrigins.includes('*')) {
        return callback(null, '*');
      }
      
      // Check if the specific origin is allowed
      if (config.corsOrigins.includes(requestOrigin)) {
        return callback(null, true);
      }
      
      return callback(new Error('Not allowed by CORS'));
    },
    credentials: true,
  }));

  // ── Body parsing ──────────────────────────────────────────────────────────
  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  // ── Logging ───────────────────────────────────────────────────────────────
  if (!config.isTest()) {
    app.use(morgan('dev'));
  }

  // ── Swagger UI ────────────────────────────────────────────────────────────
  try {
    const swaggerFile  = path.join(__dirname, 'swagger', 'swagger.yaml');
    const swaggerDoc   = yaml.load(fs.readFileSync(swaggerFile, 'utf8'));
    app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(swaggerDoc, {
      customSiteTitle: 'Sarvekshanam API',
      customCss:       '.swagger-ui .topbar { background: #0a0e1a; } .swagger-ui .topbar-wrapper img { display:none; }',
    }));
  } catch (err) {
    console.warn('[App] Swagger file not loaded:', err.message);
  }

  // ── Trust Proxy ───────────────────────────────────────────────────────────
  // Useful if we are behind a reverse proxy (Heroku, Bluemix, AWS ELB, Nginx, etc)
  // It shows the real origin IP in the express req.ip
  app.set('trust proxy', 1);

  // ── Auth routes (no /api prefix on purpose) ───────────────────────────────
  app.use('/auth', authLimiter, authRoutes);

  // ── API routes ────────────────────────────────────────────────────────────
  app.use('/api', apiLimiter, apiRoutes);

  // ── Serve frontend static files ───────────────────────────────────────────
  const frontendDir = path.join(__dirname, '../../frontend');
  if (fs.existsSync(frontendDir)) {
    app.use(express.static(frontendDir));
    // SPA fallback — return index.html for any non-API route
    app.get(/^(?!\/api|\/auth).*/, (req, res) => {
      res.sendFile(path.join(frontendDir, 'index.html'));
    });
  }

  // ── Error handler (must be last) ──────────────────────────────────────────
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
