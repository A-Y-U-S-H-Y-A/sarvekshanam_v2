'use strict';

/* ── Power User module ────────────────────────────────────────────────────── */

const PowerUser = (() => {
  let _categories    = {};
  let _activeModule  = null;   // meta object
  let _activeSession = null;   // latest session ID for AI attachment

  // ── Init ──────────────────────────────────────────────────────────────────

  async function init() {
    await loadModules();
    await refreshSessions();
    await loadRunners();

    // Subscribe to WS scan updates
    WsClient.on('SCAN_UPDATE', (msg) => {
      _onScanUpdate(msg.session);
    });

    WsClient.on('MODULES_UPDATE', () => {
      loadModules();
      loadRunners();
    });
  }

  async function loadRunners() {
    try {
      const data = await API.runners.list();
      const select = document.getElementById('pu-runner-select');
      if (select) {
        const val = select.value;
        select.innerHTML = '<option value="">Auto (Queue)</option>' + 
          data.map(r => `<option value="${r.id}">${r.name} (${r.status})</option>`).join('');
        if (val) select.value = val;
      }
    } catch(e) {
      console.error('Failed to load runners for PU', e);
    }
  }

  // ── Module Tree ───────────────────────────────────────────────────────────

  async function loadModules() {
    const tree = document.getElementById('module-tree');
    try {
      const data = await API.modules.list();
      _categories = data.categories || {};
      renderTree(_categories);
    } catch (err) {
      tree.innerHTML = `<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);">Failed to load modules:<br/>${err.message}</p>`;
    }
  }

  function renderTree(categories) {
    const searchInput = document.getElementById('module-search');
    const filterText = searchInput ? searchInput.value : '';
    const collapsedCats = new Set();
    const tree = document.getElementById('module-tree');
    
    if (tree.children.length > 0 && !tree.querySelector('p')) {
      tree.querySelectorAll('.category-modules').forEach(el => {
        if (el.classList.contains('collapsed')) {
          collapsedCats.add(el.id);
        }
      });
    }

    tree.innerHTML = '';
    for (const [cat, mods] of Object.entries(categories)) {
      const catEl = document.createElement('div');
      catEl.className = 'module-category border-b-2 border-black last:border-b-0';
      const catId = `cat-${_slug(cat)}`;
      const isCollapsed = collapsedCats.has(catId);
      
      catEl.innerHTML = `
        <div class="category-header" onclick="PowerUser._toggleCategory(this)">
          ${cat}
          <span class="category-arrow" style="${isCollapsed ? 'transform: rotate(-90deg);' : ''}">▾</span></div>
        <div class="category-modules ${isCollapsed ? 'collapsed' : ''}" id="${catId}">
          ${mods.map(m => `
            <div class="module-item" id="mod-item-${m.id}" onclick="PowerUser.selectModule('${m.id}')" title="${m.description}">
              <span class="mod-dot"></span>
              <span>${m.name}</span>
            </div>
          `).join('')}
        </div>
      `;
      tree.appendChild(catEl);
    }
    
    if (filterText) filterModules(filterText);
    
    if (_activeModule) {
      const item = document.getElementById(`mod-item-${_activeModule.id}`);
      if (item) item.classList.add('active');
    }
  }

  function _toggleCategory(header) {
    const modules = header.nextElementSibling;
    const arrow   = header.querySelector('.category-arrow');
    modules.classList.toggle('collapsed');
    arrow.style.transform = modules.classList.contains('collapsed') ? 'rotate(-90deg)' : '';
  }

  function filterModules(query) {
    const q = query.toLowerCase();
    document.querySelectorAll('.module-item').forEach(el => {
      const name = el.textContent.toLowerCase();
      el.style.display = name.includes(q) ? '' : 'none';
    });
  }

  // ── Select & Config ───────────────────────────────────────────────────────

  function selectModule(id) {
    // Find meta
    let meta = null;
    for (const mods of Object.values(_categories)) {
      meta = mods.find(m => m.id === id);
      if (meta) break;
    }
    if (!meta) return;
    _activeModule = meta;

    // Highlight
    document.querySelectorAll('.module-item').forEach(el => el.classList.remove('active'));
    document.getElementById(`mod-item-${id}`)?.classList.add('active');

    // Show config card
    document.getElementById('module-config').classList.remove('hidden');
    document.getElementById('module-empty').classList.add('hidden');
    document.getElementById('module-title').textContent = meta.name;
    document.getElementById('module-desc').textContent  = meta.description;
    document.getElementById('module-category-badge').textContent = meta.category;

    // Build param form
    const paramContainer = document.getElementById('module-params');
    paramContainer.innerHTML = meta.parameters.map(p => `
      <div class="param-field">
        <label for="param-${p.name}" >${p.name}${p.required ? ' *' : ''}</label>
        ${p.type === 'select'
          ? `<select id="param-${p.name}" class="select-styled" style="width:100%;">
               ${p.options.map(o => `<option value="${o}">${o}</option>`).join('')}
             </select>`
          : `<input id="param-${p.name}" type="text"
               class="input"
               value="${p.default || ''}"
               placeholder="${p.placeholder || p.description || ''}"
               ${p.required ? 'required' : ''} />`
        }
        <span style="display:block;margin-top:4px;font-family:var(--font-mono);font-size:0.62rem;color:var(--fg-4);font-style:italic;">${p.description}</span>
      </div>
    `).join('');
  }

  function _collectParams() {
    if (!_activeModule) return {};
    const params = {};
    _activeModule.parameters.forEach(p => {
      const el = document.getElementById(`param-${p.name}`);
      if (el) params[p.name] = el.value.trim() || (p.default ?? '');
    });
    return params;
  }

  // ── Run Scan ──────────────────────────────────────────────────────────────

  async function runScan() {
    if (!_activeModule) return;
    const params = _collectParams();
    const target = params.target;
    if (!target) { Dialog.alert('Target is required'); return; }

    const resultsCard = document.getElementById('results-card');
    const console_el  = document.getElementById('results-console');
    resultsCard.classList.remove('hidden');
    console_el.textContent = `▶ Starting ${_activeModule.name}…\n`;

    _setResultStatus('running');

    try {
      const runOpts = {};
      const runnerId = document.getElementById('pu-runner-select')?.value;
      const proxyMode = document.getElementById('pu-proxy-mode')?.value;
      const proxyTarget = document.getElementById('pu-proxy-target')?.value;
      if (runnerId) runOpts.runnerId = runnerId;
      const appointmentId = typeof Appointments !== 'undefined' ? Appointments.getActive() : undefined;
      if (!appointmentId) {
        showToast('Please create or select an active appointment first.', 'error');
        return;
      }

      const data = await API.scans.create({
        name:      `${_activeModule.name} — ${target}`,
        target,
        moduleIds: [_activeModule.id],
        params:    { [_activeModule.id]: params },
        appointmentId: appointmentId,
        ...runOpts
      });
      const session = data.session;
      _activeSession = session.id;
      WsClient.subscribe(session.id);
      _updateSessionBadge(session);
      console_el.textContent += `Session ID: ${session.id}\nStatus: pending → running…\n\n`;
    } catch (err) {
      console_el.textContent += `\n[ERROR] ${err.message}`;
      _setResultStatus('failed');
    }
  }

  function _onScanUpdate(session) {
    if (session.id !== _activeSession) {
      refreshSessions();
      return;
    }
    const console_el = document.getElementById('results-console');
    const resultsCard = document.getElementById('results-card');
    resultsCard.classList.remove('hidden');

    if (session.results) {
      let output = '';
      for (const [target, mods] of Object.entries(session.results)) {
        output += `── Target: ${target} ──\n`;
        for (const [modId, res] of Object.entries(mods)) {
          output += `\n[${modId}] Status: ${res.status}\n`;
          output += res.output || '';
          output += '\n';
        }
        output += '\n';
      }
      console_el.textContent = output || 'No output.';
    }

    _setResultStatus(session.status);
    refreshSessions();

    if (session.status === 'completed') {
      _activeSession = session.id;
      _updateSessionBadge(session);
    }
  }

  // ── Sessions ──────────────────────────────────────────────────────────────

  function attachSession(id, name) {
    _activeSession = id;
    WsClient.subscribe(id);
    _updateSessionBadge({ id, name });
    showToast(`Session "${name}" attached`);
  }

  async function relaunch(id) {
    try {
      const data = await API.scans.list({ limit: 50 });
      const session = data.sessions.find(s => s.id === id);
      if (!session) return;
      
      const payload = {
        name: `${session.name} (Retry)`,
        targets: session.targets,
        modules: session.modules,
        runner_id: session.runner_id,
        proxy_mode: session.proxy_mode,
        proxy_target: session.proxy_target
      };
      
      const newSession = await API.scans.launch(payload);
      _activeSession = newSession.session.id;
      WsClient.subscribe(_activeSession);
      _updateSessionBadge(newSession.session);
      
      const console_el = document.getElementById('results-console');
      console_el.textContent = `Relaunched Session ID: ${_activeSession}\nStatus: pending…\n\n`;
      document.getElementById('results-card').classList.remove('hidden');
      
      refreshSessions();
      showToast('Scan relaunched successfully');
    } catch (err) {
      showToast(`Failed to relaunch: ${err.message}`, 'error');
    }
  }

  // ── Utils ──────────────────────────────────────────────────────────────────

  async function refreshSessions() {
    const listEl = document.getElementById('session-list');
    const mode = document.getElementById('session-filter-mode')?.value || 'global';
    
    try {
      const qs = new URLSearchParams({ limit: 10 });
      if (mode === 'appointment' && typeof Appointments !== 'undefined') {
        const activeAppt = Appointments.getActive();
        if (activeAppt) qs.set('appointmentId', activeAppt);
        // If no active appt but 'appointment' mode selected, it will just show nothing or error.
        // Actually, if no active appt, maybe we show an empty list right away.
        if (!activeAppt) {
          listEl.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No active appointment selected.</p>';
          return;
        }
      }
      
      const data = await API.scans.list(Object.fromEntries(qs.entries()));
      if (!data.sessions?.length) {
        listEl.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No sessions yet.</p>';
        return;
      }
      listEl.innerHTML = data.sessions.map(s => {
        let extras = '';
        if (s.runner_name) extras += `<span class="status-badge">🏃 ${s.runner_name}</span>`;
        if (s.retry_count > 0) extras += `<span class="status-badge">Retry ${s.retry_count}</span>`;
        if (s.queue_position > 0) extras += `<span class="status-badge">Queue: #${s.queue_position}</span>`;
        
        let relaunchBtn = '';
        if (s.status === 'failed_permanent') {
          relaunchBtn = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); PowerUser.relaunch('${s.id}')" title="Re-launch">↻</button>`;
        }
        
        return `
        <div class="session-item" onclick="PowerUser.viewSession('${s.id}')">
          <span class="status-badge status-${s.status}">${s.status}</span>
          <span class="session-name" title="${s.targets?.join(', ')}">${s.name || s.id}</span>
          <span class="session-meta">${_relTime(s.createdAt)}</span>
          ${extras}
          ${relaunchBtn}
          <button class="btn btn-ghost btn-sm" style="margin-left:auto;" onclick="event.stopPropagation(); PowerUser.attachSession('${s.id}','${(s.name||s.id).replace(/'/g,'')}')" title="Attach to AI Chat">📎</button>
        </div>
      `;
      }).join('');
    } catch (_loadErr) {
      listEl.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Failed to load sessions.</p>';
    }
  }

  function attachSession(id, name) {
    _activeSession = id;
    WsClient.subscribe(id);
    _updateSessionBadge({ id, name });
    showToast(`Session "${name}" attached`);
  }

  function _updateSessionBadge(session) {
    const badge = document.getElementById('session-badge');
    const nameEl = document.getElementById('session-badge-name');
    badge.classList.remove('hidden');
    nameEl.textContent = session.name || session.id;
    // Notify AI module
    if (typeof AIChat !== 'undefined') AIChat.attachSessionId(session.id);
  }

  async function viewSession(id) {
    try {
      const data = await API.scans.get(id);
      _activeSession = id;
      _onScanUpdate(data.session);
      _updateSessionBadge(data.session);
    } catch (err) {
      showToast(`Failed to load session: ${err.message}`, 'error');
    }
  }

  // ── Actions ───────────────────────────────────────────────────────────────

  function copyResults() {
    const text = document.getElementById('results-console').textContent;
    navigator.clipboard.writeText(text).then(() => showToast('Copied!'));
  }

  function sendToAI() {
    App.switchTab('ai');
    if (_activeSession) AIChat.attachSessionId(_activeSession);
    AIChat.focusInput();
  }

  function clearConsole() {
    document.getElementById('results-console').textContent = '';
    document.getElementById('results-card').classList.add('hidden');
  }

  function addToBulk() {
    const params = _collectParams();
    const target = params.target;
    if (!target) { Dialog.alert('Enter a target first'); return; }
    if (typeof BulkScan !== 'undefined') BulkScan.addTarget(target, _activeModule?.id);
    App.switchTab('bulk');
    showToast(`Added ${target} to bulk scan`);
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  function _setResultStatus(status) {
    const badge = document.getElementById('result-status-badge');
    badge.className = `status-badge ${status}`;
    badge.textContent = status;
  }

  function _slug(str) { return str.toLowerCase().replace(/\s+/g, '-'); }

  function _relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)   return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400)return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  function getActiveSession() { return _activeSession; }

  return {
    init, loadModules, selectModule, filterModules, runScan, refreshSessions,
    attachSession, viewSession, relaunch, copyResults, sendToAI, clearConsole, addToBulk,
    getActiveSession, _toggleCategory,
  };
})();
