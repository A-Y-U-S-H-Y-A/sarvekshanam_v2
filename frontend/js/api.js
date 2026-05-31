'use strict';

/* ── API client ─────────────────────────────────────────────────────────────
   Typed fetch wrappers for all Sarvekshanam REST endpoints.
   All methods return parsed JSON data (throws on HTTP error).
 ─────────────────────────────────────────────────────────────────────────── */

const API = (() => {
  const BASE = '';   // same-origin; change to 'http://host:port' for remote backend

  function getToken() {
    return localStorage.getItem('sarv_token') || '';
  }

  function headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
      ...extra,
    };
  }

  async function request(method, path, body) {
    const opts = { method, headers: headers() };
    if (body !== undefined) opts.body = JSON.stringify(body);
    const res = await fetch(`${BASE}${path}`, opts);
    const data = await res.json().catch(() => ({ success: false, error: { message: res.statusText } }));
    if (!data.success) throw Object.assign(new Error(data.error?.message || 'Request failed'), { status: res.status, data });
    return data.data;
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const auth = {
    register: (username, password) => request('POST', '/auth/register', { username, password }),
    login:    (username, password) => request('POST', '/auth/login',    { username, password }),
    me:       ()                   => request('GET',  '/auth/me'),
    logout:     ()                   => request('POST', '/auth/logout'),
    oidcStatus: ()                   => request('GET',  '/auth/oidc/status'),
  };

  // ── Modules ───────────────────────────────────────────────────────────────
  const modules = {
    list:   ()   => request('GET', '/api/modules'),
    getOne: (id) => request('GET', `/api/modules/${id}`),
  };

  // ── Scans ─────────────────────────────────────────────────────────────────
  const scans = {
    create: (payload) => request('POST', '/api/scans', payload),
    bulk:   (payload) => request('POST', '/api/scans/bulk', payload),
    list:   (params = {}) => {
      return request('POST', `/api/scans/search`, params);
    },
    get:    (id) => request('GET',    `/api/scans/${id}`),
    retry:  (id) => request('POST', `/api/scans/${id}/retry`),
    approve:(id) => request('POST', `/api/scans/${id}/approve`),
    delete: (id) => request('DELETE', `/api/scans/${id}`),
  };

  // ── Appointments ──────────────────────────────────────────────────────────
  const appointments = {
    create: (payload) => request('POST', '/api/appointments', payload),
    list:   ()        => request('GET', '/api/appointments'),
    get:    (id)      => request('GET', `/api/appointments/${id}`),
    update: (id, p)   => request('PUT', `/api/appointments/${id}`, p),
    delete: (id)      => request('DELETE', `/api/appointments/${id}`),
    scans:  (id)      => request('GET', `/api/appointments/${id}/scans`),
    chats:  (id)      => request('GET', `/api/appointments/${id}/chats`),
    updateChatTitle: (id, chatId, title) => request('PUT', `/api/appointments/${id}/chats/${chatId}/title`, { title }),
  };

  // ── Commands ──────────────────────────────────────────────────────────────
  const commands = {
    submit:  (command, runnerId) => request('POST', '/api/commands', { command, runnerId }),
    list:    (params = {}) => {
      const qs = new URLSearchParams(params).toString();
      return request('GET', `/api/commands${qs ? '?' + qs : ''}`);
    },
    get:     (id)            => request('GET',  `/api/commands/${id}`),
    approve: (id)            => request('POST', `/api/commands/${id}/approve`),
    reject:  (id, reason)    => request('POST', `/api/commands/${id}/reject`, { reason }),
  };

  // ── AI ────────────────────────────────────────────────────────────────────
  const ai = {
    providers: () => request('GET', '/api/ai/providers'),
    installPackage: (providerId) => request('POST', '/api/ai/packages/install', { providerId }),
    uninstallPackage: (providerId) => request('POST', '/api/ai/packages/uninstall', { providerId }),
    fetchModels: (providerId) => request('POST', '/api/ai/models/fetch', { providerId }),
    addModel: (providerId, model) => request('POST', '/api/ai/models/add', { providerId, model }),
    removeModel: (providerId, model) => request('POST', '/api/ai/models/remove', { providerId, model }),

    /**
     * Streaming chat via SSE.
     * @param {{ provider, model, messages, sessionId? }} opts
     * @param {function(string)} onChunk  — called for each text chunk
     * @param {function()}       onDone   — called when stream ends
     * @param {function(Error)}  onError
     * @returns {AbortController}         — call .abort() to cancel
     */
    chat(opts, onChunk, onDone, onError) {
      const ctrl = new AbortController();
      let _done = false;
      const _finish = () => { if (!_done) { _done = true; onDone(); } };

      fetch(`${BASE}/api/ai/chat`, {
        method:  'POST',
        headers: headers(),
        body:    JSON.stringify(opts),
        signal:  ctrl.signal,
      })
        .then(async (res) => {
          if (!res.ok) {
            const d = await res.json().catch(() => ({}));
            throw new Error(d.error?.message || `HTTP ${res.status}`);
          }
          const reader  = res.body.getReader();
          const decoder = new TextDecoder();
          let   buf     = '';

          while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buf += decoder.decode(value, { stream: true });
            const lines = buf.split('\n');
            buf = lines.pop();         // keep incomplete line
            for (const line of lines) {
              if (!line.startsWith('data: ')) continue;
              const raw = line.slice(6).trim();
              if (raw === '[DONE]') { _finish(); return; }
              try {
                const obj = JSON.parse(raw);
                if (obj.content) onChunk(obj.content);
                if (obj.error)   onError(new Error(obj.error));
              } catch (_parseErr) { /* Non-JSON SSE line — expected for partial/malformed chunks */ }
            }
          }
          _finish();
        })
        .catch((err) => { if (err.name !== 'AbortError') onError(err); });

      return ctrl;
    },
  };

  // ── Health & Settings ─────────────────────────────────────────────────────
  const health = {
    check: () => request('GET', '/api/health'),
  };

  const settings = {
    getProxy: () => request('GET', '/api/settings/proxy'),
    setProxy: (mode, target) => request('POST', '/api/settings/proxy', { mode, target }),
  };

  // ── Runners ───────────────────────────────────────────────────────────────
  const runners = {
    list:   () => request('GET', '/api/runners'),
    create: (payload) => request('POST', '/api/runners', payload),
    update: (id, payload) => request('PUT', `/api/runners/${id}`, payload),
    delete: (id) => request('DELETE', `/api/runners/${id}`),
    run:    (id, payload) => request('POST', `/api/runners/${id}/run`, payload)
  };

  // ── API Keys ──────────────────────────────────────────────────────────────
  const keys = {
    list:    ()           => request('GET',    '/api/keys'),
    create:  (payload)    => request('POST',   '/api/keys', payload),
    revoke:  (id)         => request('DELETE', `/api/keys/${id}`),
  };

  // ── RAG / Vector Search ───────────────────────────────────────────────────
  const rag = {
    search: (query, topK = 5) => request('POST', '/api/rag/search', { query, topK }),
    stats:  ()                => request('GET',  '/api/rag/stats'),
  };

  // ── Slave Groups ──────────────────────────────────────────────────────────
  const groups = {
    list:    ()   => request('GET', '/api/groups'),
    get:     (id) => request('GET', `/api/groups/${id}`),
    runners: (id) => request('GET', `/api/groups/${id}/runners`),
  };

  // ── Queue ─────────────────────────────────────────────────────────────────
  const queue = {
    status: () => request('GET', '/api/queue/status'),
  };

  return { auth, modules, scans, appointments, commands, ai, health, settings, runners, keys, rag, groups, queue, getToken };
})();
