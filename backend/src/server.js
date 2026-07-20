'use strict';

const http      = require('http');
const WebSocket = require('ws');
const config    = require('./config');
const { createApp }                  = require('./app');
const { getWsHandler }               = require('./ws/wsHandler');
const { getScanSessionService }      = require('./services/scanSessionService');
const { getCommandService }          = require('./services/commandService');
const { getAppointmentService }      = require('./services/appointmentService');
const { getCleanupService }          = require('./services/cleanupService');

// ── Bootstrap ────────────────────────────────────────────────────────────────
const app        = createApp();
const httpServer = http.createServer(app);

// ── WebSocket server (shares HTTP server port) ────────────────────────────────
const wss       = new WebSocket.Server({ noServer: true });
const wsHandler = getWsHandler();
wsHandler.attach(wss, {
  scanSessionService: getScanSessionService(),
  commandService:     getCommandService(),
  appointmentService: getAppointmentService(),
});

httpServer.on('upgrade', (request, socket, head) => {
  // Only upgrade requests to /ws
  const { pathname } = new URL(request.url, `http://${request.headers.host}`);
  if (pathname === '/ws') {
    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  } else {
    socket.destroy();
  }
});

// ── Start ─────────────────────────────────────────────────────────────────────
httpServer.listen(config.port, () => {
  console.log(`
  ╔═══════════════════════════════════════════════════╗
  ║           S A R V E K S H A N A M                ║
  ║       Multi-System Security Operations            ║
  ╠═══════════════════════════════════════════════════╣
  ║  HTTP  →  http://localhost:${config.port}                  ║
  ║  WS    →  ws://localhost:${config.port}/ws                 ║
  ║  Docs  →  http://localhost:${config.port}/api/docs         ║
  ║  Mode  →  ${(config.nodeEnv + '            ').slice(0, 12)}                       ║
  ╚═══════════════════════════════════════════════════╝
  ╚═══════════════════════════════════════════════════╝
  `);
  
  // Start background cleanup cron jobs
  getCleanupService().start();
  
  // Recover stuck sessions
  getScanSessionService().recoverStuckSessions();
});

// ── Graceful Shutdown ─────────────────────────────────────────────────────────
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT',  () => shutdown('SIGINT'));

function shutdown(signal) {
  console.log(`\n[Server] Received ${signal} — shutting down gracefully…`);
  getCleanupService().stop();
  httpServer.close(() => {
    try { require('./db/database').closeDb(); } catch (shutdownErr) { console.warn('Failed to close database during shutdown:', shutdownErr.message); }
    process.exit(0);
  });
}

module.exports = { httpServer };   // export for tests
