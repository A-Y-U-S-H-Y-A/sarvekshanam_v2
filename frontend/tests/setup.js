// frontend/tests/setup.js
const { MockWebSocket } = require('./helpers/mockWebSocket');

// Setup global fetch and WebSocket
global.WebSocket = MockWebSocket;
