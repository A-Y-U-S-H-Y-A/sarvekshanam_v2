'use strict';

/* ── Reconnecting WebSocket client ─────────────────────────────────────────
   Handles JWT auth, session subscriptions, and automatic reconnect.
 ─────────────────────────────────────────────────────────────────────────── */

const WsClient = (() => {
  const WS_URL        = `ws://${location.host}/ws`;
  const RECONNECT_MAX = 30000;   // max backoff 30s
  const PING_INTERVAL = 20000;   // send PING every 20s

  let ws          = null;
  let retryDelay  = 1000;
  let retryTimer  = null;
  let pingTimer   = null;
  let _handlers   = {};          // type → [fn]
  let _subs       = new Set();   // subscribed session IDs
  let _authSent   = false;

  // ── Public API ─────────────────────────────────────────────────────────────

  function connect() {
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

    ws = new WebSocket(WS_URL);

    ws.addEventListener('open', () => {
      retryDelay = 1000;
      _authSent  = false;
      _setStatus('connecting');

      // Authenticate
      const token = API.getToken();
      if (token) {
        ws.send(JSON.stringify({ type: 'AUTH', token }));
      }

      // Re-subscribe to known sessions
      for (const sid of _subs) {
        ws.send(JSON.stringify({ type: 'SUBSCRIBE', sessionId: sid }));
      }

      // Heartbeat
      clearInterval(pingTimer);
      pingTimer = setInterval(() => {
        if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ type: 'PING' }));
      }, PING_INTERVAL);
    });

    ws.addEventListener('message', (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch (_) { return; }

      if (msg.type === 'AUTH_OK')    { _authSent = true; _setStatus('connected'); }
      if (msg.type === 'AUTH_ERROR') { _setStatus('disconnected'); }

      if (msg.type === 'QUEUE_UPDATE') {
        const badge = document.getElementById('queue-depth-badge');
        const label = document.getElementById('queue-depth-label');
        if (badge && label) {
          if (msg.data.position > 0) {
            badge.classList.remove('hidden');
            label.textContent = `${msg.data.position} queued (~${Math.ceil(msg.data.estimatedWaitMs/1000)}s)`;
          } else {
            badge.classList.add('hidden');
            // If it just exited the queue, it's starting now
            if (typeof showToast !== 'undefined') showToast(`Scan ${msg.data.sessionId.substring(0,8)} exited queue and is starting!`, 'success');
          }
        }
      }

      if (msg.type === 'SCAN_RETRY') {
        if (typeof showToast !== 'undefined') {
          showToast(`Retry ${msg.data.retryCount}/5 for scan ${msg.data.sessionId.substring(0,8)}`, 'warning');
        }
      }

      if (msg.type === 'POLL_AT') {
        const delay = msg.data.pollAt - Date.now();
        if (delay > 0) {
          setTimeout(() => {
            if (typeof PowerUser !== 'undefined' && PowerUser.refreshSessions) {
              PowerUser.refreshSessions();
            }
          }, delay);
        }
      }

      const fns = _handlers[msg.type] || [];
      fns.forEach(fn => fn(msg));

      // Wildcard handlers
      (_handlers['*'] || []).forEach(fn => fn(msg));
    });

    ws.addEventListener('close', () => {
      clearInterval(pingTimer);
      _setStatus('disconnected');
      _scheduleReconnect();
    });

    ws.addEventListener('error', () => {
      _setStatus('disconnected');
    });
  }

  function subscribe(sessionId) {
    _subs.add(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBSCRIBE', sessionId }));
    }
  }

  function unsubscribe(sessionId) {
    _subs.delete(sessionId);
    if (ws?.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'UNSUBSCRIBE', sessionId }));
    }
  }

  function on(type, fn) {
    if (!_handlers[type]) _handlers[type] = [];
    _handlers[type].push(fn);
    return () => {  // returns unsubscribe fn
      _handlers[type] = _handlers[type].filter(h => h !== fn);
    };
  }

  function disconnect() {
    clearTimeout(retryTimer);
    clearInterval(pingTimer);
    if (ws) { ws.close(); ws = null; }
  }

  // ── Private ────────────────────────────────────────────────────────────────

  function _scheduleReconnect() {
    clearTimeout(retryTimer);
    retryTimer = setTimeout(() => {
      retryDelay = Math.min(retryDelay * 1.5, RECONNECT_MAX);
      connect();
    }, retryDelay);
  }

  function _setStatus(status) {
    const dot   = document.getElementById('ws-dot');
    const label = document.getElementById('ws-label');
    if (dot) {
      dot.className = 'ws-dot ' + (status === 'connected' ? 'connected' : 'disconnected');
    }
    if (label) {
      label.textContent = { connected: 'Synced', connecting: 'Syncing…', disconnected: 'Offline' }[status] || status;
    }
  }

  return { connect, subscribe, unsubscribe, on, disconnect };
})();
