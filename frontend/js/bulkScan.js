'use strict';

/* ── Bulk Scan module ─────────────────────────────────────────────────────── */

const BulkScan = (() => {
  let _sessions = [];
  let _allModules = [];

  function _escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  async function init() {
    await loadModuleCheckboxes();
    await loadRunners();
    updateCountBadge();
    WsClient.on('SCAN_UPDATE', (msg) => _onBulkUpdate(msg.session));
    WsClient.on('MODULES_UPDATE', () => {
      loadModuleCheckboxes();
      loadRunners();
    });
  }

  async function loadRunners() {
    try {
      const data = await API.runners.list();
      const select = document.getElementById('bulk-runner-select');
      if (select) {
        const val = select.value;
        select.innerHTML = '<option value="">Auto (Queue)</option>' + 
          data.map(r => `<option value="${_escHtml(r.id)}">${_escHtml(r.name)} (${_escHtml(r.status)})</option>`).join('');
        if (val) select.value = val;
      }
    } catch(e) {
      console.error('Failed to load runners for BulkScan', e);
    }
  }

  // ── Module checkboxes ─────────────────────────────────────────────────────

  async function loadModuleCheckboxes() {
    const container = document.getElementById('bulk-modules');
    const checked = _checkedModules();
    try {
      const data = await API.modules.list();
      const all  = Object.values(data.categories).flat();
      _allModules = all;
      container.innerHTML = all.map(m => `
        <div class="bulk-module-item" onclick="this.querySelector('input').click()">
          <input type="checkbox" id="bulk-mod-${_escHtml(m.id)}" value="${_escHtml(m.id)}" onchange="BulkScan.updateCountBadge();BulkScan.renderParams()" style="accent-color:var(--amber);width:13px;height:13px;flex-shrink:0;cursor:pointer;" ${checked.includes(m.id) ? 'checked' : ''} />
          <label for="bulk-mod-${_escHtml(m.id)}" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;width:100%;gap:8px;">
            ${_escHtml(m.name)} 
            <span style="font-size:0.62rem;color:var(--fg-4);font-style:italic;font-weight:400;">${_escHtml(m.category)}</span>
          </label>
        </div>
      `).join('');
      updateCountBadge();
    } catch (_loadErr) {
      container.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Failed to load modules.</p>';
    }
  }

  function _checkedModules() {
    return [...document.querySelectorAll('#bulk-modules input:checked')].map(el => el.value);
  }

  function _parseTargets() {
    const raw = document.getElementById('bulk-targets').value;
    return raw.split(/[\n,]+/).map(t => t.trim()).filter(Boolean);
  }

  function updateCountBadge() {
    const targets = _parseTargets().length;
    const mods    = _checkedModules().length;
    document.getElementById('bulk-count-badge').textContent = `${targets} target${targets !== 1 ? 's' : ''}, ${mods} module${mods !== 1 ? 's' : ''}`;
  }

  function addTarget(target, moduleId) {
    // Append target to textarea
    const ta  = document.getElementById('bulk-targets');
    ta.value  = ta.value ? ta.value.trimEnd() + '\n' + target : target;

    // Check module checkbox
    if (moduleId) {
      const cb = document.getElementById(`bulk-mod-${moduleId}`);
      if (cb) cb.checked = true;
    }

    updateCountBadge();
  }

  // ── Run ───────────────────────────────────────────────────────────────────

  async function run() {
    const targets   = _parseTargets();
    const moduleIds = _checkedModules();
    const name      = document.getElementById('bulk-name').value.trim();

    if (!targets.length)   { showToast('Enter at least one target', 'error'); return; }
    if (!moduleIds.length) { showToast('Select at least one module', 'error'); return; }

    const runnerId = document.getElementById('bulk-runner-select')?.value;
    const proxyMode = document.getElementById('bulk-proxy-mode')?.value;
    const proxyTarget = document.getElementById('bulk-proxy-target')?.value;

    const mode = document.getElementById('bulk-param-mode')?.value || 'grouped';
    const params = {};
    const inputs = document.querySelectorAll('.bulk-param-input');

    if (mode === 'grouped') {
      const groupedVals = {};
      inputs.forEach(el => {
        const pName = el.getAttribute('data-param-name');
        if (el.value.trim() !== '') groupedVals[pName] = el.value.trim();
      });
      const modules = _allModules.filter(m => moduleIds.includes(m.id));
      modules.forEach(m => {
        params[m.id] = {};
        (m.parameters || []).forEach(p => {
          if (p.name !== 'target' && groupedVals[p.name] !== undefined) {
            params[m.id][p.name] = groupedVals[p.name];
          }
        });
      });
    } else {
      inputs.forEach(el => {
        const modId = el.getAttribute('data-module-id');
        const pName = el.getAttribute('data-param-name');
        if (el.value.trim() !== '') {
          if (!params[modId]) params[modId] = {};
          params[modId][pName] = el.value.trim();
        }
      });
    }

    const runOpts = { name: name || undefined, targets, moduleIds, params };
    const appointmentId = typeof Appointments !== 'undefined' ? Appointments.getActive() : undefined;
    if (!appointmentId) {
      showToast('Please create or select an active appointment first.', 'error');
      return;
    }
    runOpts.appointmentId = appointmentId;

    if (runnerId) runOpts.runnerId = runnerId;
    if (proxyMode) runOpts.proxyConfig = { mode: proxyMode, target: proxyTarget };

    try {
      const data = await API.scans.bulk(runOpts);
      _sessions  = data.sessions;

      // Subscribe to all sessions
      _sessions.forEach(s => WsClient.subscribe(s.id));
      renderProgress(_sessions);
      showToast(`Bulk scan started: ${_sessions.length} sessions`);
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  async function refresh() {
    try {
      const data = await API.scans.list({ limit: 50 });
      const bulk = (data.sessions || []).filter(s => s.mode === 'bulk');
      renderProgress(bulk);
    } catch (refreshErr) { console.warn('Failed to refresh bulk scan list:', refreshErr.message); }
  }

  // ── Progress UI ───────────────────────────────────────────────────────────

  function renderProgress(sessions) {
    const container = document.getElementById('bulk-progress-list');
    if (!sessions.length) {
      container.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No bulk scans running.</p>';
      return;
    }
    container.innerHTML = sessions.map(s => _progressItemHtml(s)).join('');
  }

  function _progressItemHtml(s) {
    const pct = s.status === 'completed' ? 100 : s.status === 'running' ? 60 : s.status === 'failed' ? 100 : 0;
    const barColor = s.status === 'failed' ? 'var(--accent-red)' : '';
    
    let extras = '';
    if (s.runner_name) extras += `<span class="status-badge">🏃 ${_escHtml(s.runner_name)}</span>`;
    if (s.retry_count > 0) extras += `<span class="status-badge">Retry ${_escHtml(s.retry_count)}</span>`;
    if (s.queue_position > 0) extras += `<span class="status-badge">Queue: #${_escHtml(s.queue_position)}</span>`;

    const sessName = s.name || s.targets?.[0] || '—';
    const attachName = (s.name || s.id).replace(/'/g,'');

    return `
      <div class="bulk-progress-item" id="bulk-sess-${_escHtml(s.id)}">
        <div class="bulk-progress-header">
          <span class="bulk-progress-name">${_escHtml(sessName)}</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${extras}
            <span class="status-badge status-${_escHtml(s.status)}">${_escHtml(s.status)}</span>
            <button class="btn btn-ghost btn-sm" onclick="PowerUser.attachSession('${_escHtml(s.id)}','${_escHtml(attachName)}')">📎</button>
          </div>
        </div>
        <div class="bulk-progress-bar-wrap">
          <div class="bulk-progress-bar-fill" id="bar-${_escHtml(s.id)}" style="width:${pct}%;${barColor ? 'background:'+barColor : ''}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">
          <span>${_escHtml(s.moduleIds?.join(', '))}</span>
          <span>${_relTime(s.createdAt)}</span>
        </div>
      </div>
    `;
  }

  function _onBulkUpdate(session) {
    const el = document.getElementById(`bulk-sess-${session.id}`);
    if (!el) return;
    const pct = session.status === 'completed' ? 100 : session.status === 'running' ? 60 : 0;
    const bar = document.getElementById(`bar-${session.id}`);
    if (bar) bar.style.width = pct + '%';
    el.querySelector('.status-badge').className = `status-badge ${session.status}`;
    el.querySelector('.status-badge').textContent = session.status;
  }

  function _relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  }

  function renderParams() {
    const section = document.getElementById('bulk-params-section');
    const container = document.getElementById('bulk-params-container');
    if (!section || !container) return;

    const checkedIds = _checkedModules();
    const modules = _allModules.filter(m => checkedIds.includes(m.id));
    
    let hasParams = false;
    for (const m of modules) {
      if (m.parameters && m.parameters.some(p => p.name !== 'target')) {
        hasParams = true;
        break;
      }
    }

    if (!hasParams) {
      section.classList.add('hidden');
      container.innerHTML = '';
      return;
    }

    section.classList.remove('hidden');
    const mode = document.getElementById('bulk-param-mode')?.value || 'grouped';

    let html = '';
    if (mode === 'grouped') {
      const uniqueParams = new Map();
      modules.forEach(m => {
        (m.parameters || []).forEach(p => {
          if (p.name !== 'target') uniqueParams.set(p.name, p);
        });
      });
      for (const [name, p] of uniqueParams.entries()) {
        html += `
          <div class="field-group" style="margin:0;">
            <label class="input-label">${_escHtml(p.name)} ${p.required ? '<span style="color:var(--accent-red)">*</span>' : ''}</label>
            <input type="${p.type === 'number' ? 'number' : 'text'}" class="input bulk-param-input" data-param-name="${_escHtml(p.name)}" placeholder="${_escHtml(p.description || '')}" />
          </div>
        `;
      }
    } else {
      modules.forEach(m => {
        const params = (m.parameters || []).filter(p => p.name !== 'target');
        if (!params.length) return;
        html += `<div style="font-weight:600;font-size:0.8rem;color:var(--amber);margin-top:4px;">${_escHtml(m.name)}</div>`;
        params.forEach(p => {
          html += `
            <div class="field-group" style="margin:0 0 0 8px;">
              <label class="input-label">${_escHtml(p.name)} ${p.required ? '<span style="color:var(--accent-red)">*</span>' : ''}</label>
              <input type="${p.type === 'number' ? 'number' : 'text'}" class="input bulk-param-input" data-module-id="${_escHtml(m.id)}" data-param-name="${_escHtml(p.name)}" placeholder="${_escHtml(p.description || '')}" />
            </div>
          `;
        });
      });
    }

    container.innerHTML = html;
  }

  return { init, run, refresh, addTarget, updateCountBadge, renderParams };
})();
