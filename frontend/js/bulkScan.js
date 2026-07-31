'use strict';

/* ── Bulk Scan module ─────────────────────────────────────────────────────── */

const BulkScan = (() => {
  let _sessions = [];
  let _groupedSessions = {};
  let _allModules = [];
  let _currentGroupId = null;
  let _currentPage = 1;
  const PAGE_SIZE = 10;

  

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
          data.map(r => `<option value="${Utils.escHtml(r.id)}">${Utils.escHtml(r.name)} (${Utils.escHtml(r.status)})</option>`).join('');
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
          <input type="checkbox" id="bulk-mod-${Utils.escHtml(m.id)}" value="${Utils.escHtml(m.id)}" onchange="BulkScan.updateCountBadge();BulkScan.renderParams()" style="accent-color:var(--amber);width:13px;height:13px;flex-shrink:0;cursor:pointer;" ${checked.includes(m.id) ? 'checked' : ''} />
          <label for="bulk-mod-${Utils.escHtml(m.id)}" style="cursor:pointer;user-select:none;display:flex;justify-content:space-between;align-items:center;width:100%;gap:8px;">
            ${Utils.escHtml(m.name)} 
            <span style="font-size:0.62rem;color:var(--fg-4);font-style:italic;font-weight:400;">${Utils.escHtml(m.category)}</span>
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

  // ── File Upload & Mapping ─────────────────────────────────────────────────
  let _uploadedFileData = null;
  let _mappedTargets = [];

  async function handleFileUpload(event) {
    const file = event.target.files[0];
    if (!file) return;
    try {
      const data = await API.files.upload(file);
      _uploadedFileData = data; // { headers, rows }
      _showMappingUI();
    } catch (err) {
      if (typeof showToast !== 'undefined') showToast(`Upload failed: ${err.message}`, 'error');
      else alert(`Upload failed: ${err.message}`);
    }
    event.target.value = ''; // reset
  }

  function _showMappingUI() {
    if (!_uploadedFileData || !_uploadedFileData.headers.length) return;
    const section = document.getElementById('bulk-mapping-section');
    const container = document.getElementById('bulk-mapping-container');
    if (!section || !container) return;

    const headers = _uploadedFileData.headers;
    const optionsHtml = `<option value="">-- None --</option>` + headers.map(h => `<option value="${Utils.escHtml(h)}">${Utils.escHtml(h)}</option>`).join('');

    let html = `
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <label style="font-size:0.75rem;color:var(--fg-2);">Target / URI Field <span style="color:var(--accent-red)">*</span></label>
        <select id="map-col-target" class="select-styled" style="width:200px;font-size:0.75rem;">
          <option value="">-- Select Column --</option>
          ${headers.map(h => `<option value="${Utils.escHtml(h)}" ${h.toLowerCase().includes('target') || h.toLowerCase().includes('ip') || h.toLowerCase().includes('url') ? 'selected' : ''}>${Utils.escHtml(h)}</option>`).join('')}
        </select>
      </div>
    `;

    // We can also allow mapping global params or specific module params.
    // For simplicity, let's gather all unique parameters from selected modules.
    const checkedIds = _checkedModules();
    const modules = _allModules.filter(m => checkedIds.includes(m.id));
    const uniqueParams = new Map();
    modules.forEach(m => {
      (m.parameters || []).forEach(p => {
        if (p.name !== 'target') uniqueParams.set(p.name, p);
      });
    });

    for (const [name, p] of uniqueParams.entries()) {
      html += `
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <label style="font-size:0.75rem;color:var(--fg-2);">Param: ${Utils.escHtml(name)}</label>
          <select class="select-styled map-col-param" data-param-name="${Utils.escHtml(name)}" style="width:200px;font-size:0.75rem;">
            ${optionsHtml}
          </select>
        </div>
      `;
    }

    container.innerHTML = html;
    section.classList.remove('hidden');
  }

  function applyMapping() {
    if (!_uploadedFileData) return;
    const targetCol = document.getElementById('map-col-target').value;
    if (!targetCol) {
      if (typeof showToast !== 'undefined') showToast('Please select a column for Target / URI', 'error');
      else alert('Please select a column for Target / URI');
      return;
    }

    const paramSelects = document.querySelectorAll('.map-col-param');
    const paramMappings = {};
    paramSelects.forEach(sel => {
      if (sel.value) paramMappings[sel.getAttribute('data-param-name')] = sel.value;
    });

    const rows = _uploadedFileData.rows;
    _mappedTargets = [];
    const uris = [];

    rows.forEach(row => {
      const uri = row[targetCol];
      if (!uri) return;
      uris.push(uri);
      const rowParams = {};
      for (const [pName, colName] of Object.entries(paramMappings)) {
        if (row[colName] !== undefined && row[colName] !== '') {
          rowParams[pName] = row[colName];
        }
      }
      _mappedTargets.push({ uri, params: rowParams });
    });

    const ta = document.getElementById('bulk-targets');
    ta.value = uris.join('\n');
    updateCountBadge();
    cancelMapping();
    if (typeof showToast !== 'undefined') showToast(`Mapped ${_mappedTargets.length} targets`);
  }

  function cancelMapping() {
    _uploadedFileData = null;
    const section = document.getElementById('bulk-mapping-section');
    if (section) section.classList.add('hidden');
  }

  async function downloadTargets(format = 'csv') {
    const uris = _parseTargets();
    if (!uris.length) {
      if (typeof showToast !== 'undefined') showToast('No targets to download', 'error');
      return;
    }
    
    // Construct entries
    const entries = uris.map(uri => {
      const mapped = _mappedTargets.find(m => m.uri === uri);
      return mapped ? { Target: uri, ...mapped.params } : { Target: uri };
    });

    try {
      const blob = await API.files.download(entries, format);
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `targets.${format}`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      if (typeof showToast !== 'undefined') showToast(`Download failed: ${err.message}`, 'error');
    }
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

    const finalTargets = targets.map(uri => {
      const mapped = _mappedTargets.find(m => m.uri === uri);
      if (mapped) return { uri, params: mapped.params };
      return uri;
    });

    const runOpts = { name: name || undefined, targets: finalTargets, moduleIds, params };
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

  function getGroupedHtml(sessions, options = {}) {
    const localGroups = {};
    sessions.forEach(s => {
      const gId = s.groupId || s.id;
      if (!localGroups[gId]) localGroups[gId] = [];
      localGroups[gId].push(s);
      
      if (!_groupedSessions[gId]) _groupedSessions[gId] = [];
      const idx = _groupedSessions[gId].findIndex(x => x.id === s.id);
      if (idx !== -1) _groupedSessions[gId][idx] = s;
      else _groupedSessions[gId].push(s);
    });

    return Object.entries(localGroups)
      .map(([gId, groupSessions]) => _progressGroupHtml(gId, groupSessions, options))
      .join('');
  }

  function renderProgress(sessions) {
    const container = document.getElementById('bulk-progress-list');
    if (!sessions.length) {
      container.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No bulk scans running.</p>';
      return;
    }
    
    container.innerHTML = getGroupedHtml(sessions);
  }

  function _progressGroupHtml(gId, sessions, options) {
    if (sessions.length === 1 && !sessions[0].groupId) {
       return _progressItemHtml(sessions[0], options);
    }
    
    let completed = 0, failed = 0, running = 0;
    sessions.forEach(s => {
      if (s.status === 'completed') completed++;
      else if (s.status === 'failed') failed++;
      else if (s.status === 'running') running++;
    });

    const total = sessions.length;
    const done = completed + failed;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const isFailed = failed > 0;
    const barColor = isFailed ? 'var(--accent-red)' : '';
    
    let baseName = sessions[0].name || sessions[0].targets?.[0] || 'Bulk Scan';
    const match = baseName.match(/^(.*)\s+\[\d+\/\d+\]$/);
    if (match) baseName = match[1];

    let overallStatus = done === total ? 'completed' : running > 0 ? 'running' : 'pending';

    return `
      <div class="bulk-progress-item" id="bulk-group-${Utils.escHtml(gId)}" style="cursor:pointer;" onclick="BulkScan.showGroupDetails('${Utils.escHtml(gId)}')">
        <div class="bulk-progress-header">
          <span class="bulk-progress-name">📁 ${Utils.escHtml(baseName)} <span style="font-size:0.75rem;color:var(--fg-4);font-weight:normal;">(${total} targets)</span></span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            <span class="status-badge status-${overallStatus}">${overallStatus}</span>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); API.scans.exportGroup('${Utils.escHtml(gId)}', 'json-zip')" title="Export JSON Zip">⬇️ Zip</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); API.scans.exportGroup('${Utils.escHtml(gId)}', 'csv')" title="Export CSV">⬇️ CSV</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); API.scans.exportGroup('${Utils.escHtml(gId)}', 'xlsx')" title="Export Excel">⬇️ Excel</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); BulkScan.attachGroupToAI('${Utils.escHtml(gId)}')">📎</button>
          </div>
        </div>
        <div class="bulk-progress-bar-wrap">
          <div class="bulk-progress-bar-fill" id="group-bar-${Utils.escHtml(gId)}" style="width:${pct}%;${barColor ? 'background:'+barColor : ''}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">
          <span id="group-stats-${Utils.escHtml(gId)}">${done} / ${total} finished</span>
          <span>${_relTime(sessions[0].createdAt)}</span>
        </div>
      </div>
    `;
  }

  function _progressItemHtml(s, options = {}) {
    const pct = s.status === 'completed' ? 100 : s.status === 'running' ? 60 : s.status === 'failed' ? 100 : 0;
    const barColor = s.status === 'failed' ? 'var(--accent-red)' : '';
    
    let extras = '';
    if (s.runner_name) extras += `<span class="status-badge">🏃 ${Utils.escHtml(s.runner_name)}</span>`;
    if (s.retry_count > 0) extras += `<span class="status-badge">Retry ${Utils.escHtml(s.retry_count)}</span>`;
    if (s.queue_position > 0) extras += `<span class="status-badge">Queue: #${Utils.escHtml(s.queue_position)}</span>`;
    
    let relaunchBtn = '';
    if (s.status === 'failed_permanent' && options.allowRelaunch) {
      relaunchBtn = `<button class="btn btn-secondary btn-sm" onclick="event.stopPropagation(); PowerUser.relaunch('${Utils.escHtml(s.id)}')">↻</button>`;
    }

    const sessName = s.name || s.targets?.[0] || '—';
    const attachName = (s.name || s.id).replace(/'/g,'');
    
    const clickAttr = options.onClickItem ? `onclick="${options.onClickItem}('${Utils.escHtml(s.id)}'); event.stopPropagation()"` : `onclick="event.stopPropagation()"`;
    const cursor = options.onClickItem ? 'cursor:pointer;' : 'cursor:default;';

    return `
      <div class="bulk-progress-item" id="bulk-sess-${Utils.escHtml(s.id)}" style="${cursor}" ${clickAttr}>
        <div class="bulk-progress-header">
          <span class="bulk-progress-name">${Utils.escHtml(sessName)}</span>
          <div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;">
            ${extras}
            ${relaunchBtn}
            <span class="status-badge status-${Utils.escHtml(s.status)}">${Utils.escHtml(s.status)}</span>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); API.scans.exportScan('${Utils.escHtml(s.id)}')" title="Export JSON">⬇️ JSON</button>
            <button class="btn btn-ghost btn-sm" onclick="event.stopPropagation(); PowerUser.attachSession('${Utils.escHtml(s.id)}','${Utils.escHtml(attachName)}')">📎</button>
          </div>
        </div>
        <div class="bulk-progress-bar-wrap">
          <div class="bulk-progress-bar-fill" id="bar-${Utils.escHtml(s.id)}" style="width:${pct}%;${barColor ? 'background:'+barColor : ''}"></div>
        </div>
        <div style="display:flex;justify-content:space-between;font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">
          <span>${Utils.escHtml(s.moduleIds?.join(', '))}</span>
          <span>${_relTime(s.createdAt)}</span>
        </div>
      </div>
    `;
  }

  function _onBulkUpdate(session) {
    const gId = session.groupId || session.id;
    if (_groupedSessions[gId]) {
      const idx = _groupedSessions[gId].findIndex(s => s.id === session.id);
      if (idx !== -1) {
        _groupedSessions[gId][idx] = session;
      } else {
        _groupedSessions[gId].push(session);
      }
      
      _updateGroupCard(gId);
      
      if (_currentGroupId === gId) {
        renderGroupModal();
      }
    } else {
      refresh();
    }
  }

  function _updateGroupCard(gId) {
    const sessions = _groupedSessions[gId];
    if (!sessions) return;
    
    if (sessions.length === 1 && !sessions[0].groupId) {
       const el = document.getElementById(`bulk-sess-${sessions[0].id}`);
       if (!el) return;
       const pct = sessions[0].status === 'completed' ? 100 : sessions[0].status === 'running' ? 60 : sessions[0].status === 'failed' ? 100 : 0;
       const bar = document.getElementById(`bar-${sessions[0].id}`);
       if (bar) {
           bar.style.width = pct + '%';
           bar.style.background = sessions[0].status === 'failed' ? 'var(--accent-red)' : '';
       }
       const badge = el.querySelector('.status-badge');
       if (badge) {
         badge.className = `status-badge status-${sessions[0].status}`;
         badge.textContent = sessions[0].status;
       }
       return;
    }

    let completed = 0, failed = 0, running = 0;
    sessions.forEach(s => {
      if (s.status === 'completed') completed++;
      else if (s.status === 'failed') failed++;
      else if (s.status === 'running') running++;
    });
    
    const total = sessions.length;
    const done = completed + failed;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const isFailed = failed > 0;
    const barColor = isFailed ? 'var(--accent-red)' : '';
    let overallStatus = done === total ? 'completed' : running > 0 ? 'running' : 'pending';

    const groupEl = document.getElementById(`bulk-group-${gId}`);
    if (groupEl) {
      const bar = document.getElementById(`group-bar-${gId}`);
      if (bar) {
        bar.style.width = pct + '%';
        bar.style.background = barColor || '';
      }
      const stats = document.getElementById(`group-stats-${gId}`);
      if (stats) stats.textContent = `${done} / ${total} finished`;
      const badge = groupEl.querySelector('.status-badge');
      if (badge) {
        badge.className = `status-badge status-${overallStatus}`;
        badge.textContent = overallStatus;
      }
    }
  }

  function showGroupDetails(gId) {
    _currentGroupId = gId;
    _currentPage = 1;
    const modal = document.getElementById('bulk-scan-details-modal');
    modal.classList.remove('hidden');
    renderGroupModal();
  }

  function hideGroupDetails() {
    const modal = document.getElementById('bulk-scan-details-modal');
    modal.classList.add('hidden');
    _currentGroupId = null;
  }

  function renderGroupModal() {
    if (!_currentGroupId || !_groupedSessions[_currentGroupId]) return;
    const sessions = _groupedSessions[_currentGroupId];
    const total = sessions.length;
    
    let completed = 0, failed = 0;
    sessions.forEach(s => {
      if (s.status === 'completed') completed++;
      else if (s.status === 'failed') failed++;
    });
    
    const done = completed + failed;
    const pct = total > 0 ? (done / total) * 100 : 0;
    const isFailed = failed > 0;
    const barColor = isFailed ? 'var(--accent-red)' : '';
    
    const bar = document.getElementById('bulk-scan-details-progress-bar');
    if (bar) {
      bar.style.width = pct + '%';
      bar.style.background = barColor || '';
    }
    const stats = document.getElementById('bulk-scan-details-stats');
    if (stats) stats.textContent = `${done} / ${total} completed`;

    const totalPages = Math.ceil(total / PAGE_SIZE) || 1;
    if (_currentPage > totalPages) _currentPage = totalPages;

    const start = (_currentPage - 1) * PAGE_SIZE;
    const pageSessions = sessions.slice(start, start + PAGE_SIZE);

    const list = document.getElementById('bulk-scan-details-list');
    if (list) {
      list.innerHTML = pageSessions.map(s => _progressItemHtml(s)).join('');
    }

    const info = document.getElementById('bulk-scan-page-info');
    if (info) info.textContent = `Page ${_currentPage} of ${totalPages}`;

    const prevBtn = document.getElementById('bulk-scan-page-prev');
    if (prevBtn) prevBtn.disabled = _currentPage <= 1;
    
    const nextBtn = document.getElementById('bulk-scan-page-next');
    if (nextBtn) nextBtn.disabled = _currentPage >= totalPages;
  }

  function prevPage() {
    if (_currentPage > 1) {
      _currentPage--;
      renderGroupModal();
    }
  }

  function nextPage() {
    if (!_currentGroupId) return;
    const totalPages = Math.ceil((_groupedSessions[_currentGroupId]?.length || 0) / PAGE_SIZE);
    if (_currentPage < totalPages) {
      _currentPage++;
      renderGroupModal();
    }
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
            <label class="input-label">${Utils.escHtml(p.name)} ${p.required ? '<span style="color:var(--accent-red)">*</span>' : ''}</label>
            <input type="${p.type === 'number' ? 'number' : 'text'}" class="input bulk-param-input" data-param-name="${Utils.escHtml(p.name)}" placeholder="${Utils.escHtml(p.description || '')}" />
          </div>
        `;
      }
    } else {
      modules.forEach(m => {
        const params = (m.parameters || []).filter(p => p.name !== 'target');
        if (!params.length) return;
        html += `<div style="font-weight:600;font-size:0.8rem;color:var(--amber);margin-top:4px;">${Utils.escHtml(m.name)}</div>`;
        params.forEach(p => {
          html += `
            <div class="field-group" style="margin:0 0 0 8px;">
              <label class="input-label">${Utils.escHtml(p.name)} ${p.required ? '<span style="color:var(--accent-red)">*</span>' : ''}</label>
              <input type="${p.type === 'number' ? 'number' : 'text'}" class="input bulk-param-input" data-module-id="${Utils.escHtml(m.id)}" data-param-name="${Utils.escHtml(p.name)}" placeholder="${Utils.escHtml(p.description || '')}" />
            </div>
          `;
        });
      });
    }

    container.innerHTML = html;
  }

  function attachGroupToAI(gId) {
    if (typeof AIChat === 'undefined') return;
    const sessions = _groupedSessions[gId];
    if (!sessions || sessions.length === 0) return;
    
    sessions.forEach(s => {
      AIChat.attachSessionId(s.id);
    });
    
    showToast(`Attached ${sessions.length} sessions to AI Chat`);
  }

  return { init, run, refresh, addTarget, updateCountBadge, renderParams, handleFileUpload, applyMapping, cancelMapping, downloadTargets, showGroupDetails, hideGroupDetails, prevPage, nextPage, getGroupedHtml, attachGroupToAI };
})();
