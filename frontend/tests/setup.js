// frontend/tests/setup.js
const { MockWebSocket } = require('./helpers/mockWebSocket');

// Setup global fetch and WebSocket
global.WebSocket = MockWebSocket;

// Setup global Utils
global.Utils = {
  escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
};
if (typeof window !== 'undefined') {
  window.Utils = global.Utils;
}
