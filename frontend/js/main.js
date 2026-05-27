'use strict';

/* ── App bootstrap ────────────────────────────────────────────────────────── */

const App = (() => {
  let _activeTab = 'power';

  async function boot() {
    let targetRoute = window.location.pathname.substring(1) || 'power';
    const validRoutes = ['power', 'ai', 'bulk', 'appointments', 'runners', 'cmd', 'trash'];
    if (!validRoutes.includes(targetRoute)) targetRoute = 'power';

    // Restore auth
    const user = await Auth.init();
    if (!user) {
      Auth.setRedirectRoute(targetRoute);
      return;   // waiting for login
    }

    _setupUser(user);
    WsClient.connect();

    // Appointments provide the active work context used by the other modules.
    await Appointments.init();
    await Promise.all([
      PowerUser.init(),
      AIChat.init(),
      BulkScan.init(),
      Commands.init(),
      (typeof Runners !== 'undefined' ? Runners.load() : Promise.resolve()),
    ]);

    // Hide admin tab for non-admins
    if (user.role !== 'admin') {
      document.querySelectorAll('[data-admin]').forEach(el => el.style.display = 'none');
      if (targetRoute === 'trash') targetRoute = 'power';
    }

    switchTab(targetRoute, false);
    history.replaceState({ tab: targetRoute }, '', `/${targetRoute}`);
  }

  async function onLogin(user) {
    _setupUser(user);
    WsClient.connect();
    await Appointments.init();
    await Promise.all([
      PowerUser.init(),
      AIChat.init(),
      BulkScan.init(),
      Commands.init(),
      (typeof Runners !== 'undefined' ? Runners.load() : Promise.resolve()),
    ]);
    if (user.role !== 'admin') {
      document.querySelectorAll('[data-admin]').forEach(el => el.style.display = 'none');
    }

    let route = Auth.getRedirectRoute() || 'power';
    if (user.role !== 'admin' && route === 'trash') route = 'power';
    
    switchTab(route, false);
    history.replaceState({ tab: route }, '', `/${route}`);
  }

  function _setupUser(user) {
    document.getElementById('user-name').textContent   = user.username;
    document.getElementById('user-avatar').textContent = user.username[0].toUpperCase();
    document.getElementById('dd-username').textContent = user.username;
    const roleBadge = document.getElementById('dd-role');
    roleBadge.textContent = user.role;
    roleBadge.className   = `role-badge ${user.role}`;
  }

  function switchTab(tab, updateUrl = true) {
    // Hide all panels
    document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));

    // Show target
    const panel = document.getElementById(`panel-${tab}`);
    const tabEl = document.getElementById(`tab-${tab}`);
    if (panel) panel.classList.add('active');
    if (tabEl) tabEl.classList.add('active');

    _activeTab = tab;
    if (tab === 'power' && typeof PowerUser !== 'undefined' && PowerUser.refreshSessions) {
      PowerUser.refreshSessions();
    }
    if (tab === 'ai' && typeof AIChat !== 'undefined' && AIChat.updateRagStats) {
      AIChat.updateRagStats();
    }

    if (updateUrl) {
      history.pushState({ tab }, '', `/${tab}`);
    }
  }

  function toggleUserMenu() {
    const dropdown = document.getElementById('user-dropdown');
    dropdown.classList.toggle('hidden');

    // Close on outside click
    const close = (e) => {
      if (!document.getElementById('user-menu').contains(e.target)) {
        dropdown.classList.add('hidden');
        document.removeEventListener('click', close);
      }
    };
    setTimeout(() => document.addEventListener('click', close), 0);
  }

  // ── Settings ──────────────────────────────────────────────────────────────
  async function showSettings() {
    const modal = document.getElementById('settings-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    loadApiKeys();
    try {
      const data = await API.settings.getProxy();
      document.getElementById('setting-proxy-mode').value = data.mode || 'none';
      document.getElementById('setting-proxy-target').value = data.target || '';
      onProxyModeChange();
    } catch (_) {
      showToast('Failed to load settings', 'error');
    }
  }

  function hideSettings() {
    const _sm = document.getElementById('settings-modal'); _sm.classList.add('hidden'); _sm.style.display = 'none';
  }

  function onProxyModeChange() {
    const mode = document.getElementById('setting-proxy-mode').value;
    const targetGroup = document.getElementById('proxy-target-group');
    const hint = document.getElementById('proxy-hint');

    if (mode === 'none') {
      targetGroup.style.display = 'none';
      hint.textContent = 'All execution will be performed locally on this backend.';
    } else if (mode === 'hop') {
      targetGroup.style.display = 'block';
      hint.textContent = 'Submits modules via HTTP_PROXY environment variables (A→B→C→Target).';
    } else {
      targetGroup.style.display = 'block';
      hint.textContent = 'Bypasses backend execution for client commands (A→C→Target).';
    }
  }

  async function saveSettings() {
    const mode = document.getElementById('setting-proxy-mode').value;
    const target = document.getElementById('setting-proxy-target').value.trim();
    
    if (mode !== 'none' && !target) {
      showToast('Proxy Target URL is required', 'error');
      return;
    }

    try {
      await API.settings.setProxy(mode, target);
      showToast('Settings saved globally');
      hideSettings();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  // ── API Keys ──────────────────────────────────────────────────────────────

  async function loadApiKeys() {
    const listEl = document.getElementById('api-keys-list');
    if (!listEl) return;
    try {
      const { data } = await API.keys.list();
      if (!data || data.length === 0) {
        listEl.innerHTML = '<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No API keys generated.</p>';
        return;
      }
      listEl.innerHTML = data.map(k => `
        <div class="api-key-item">
          <div>
            <div style="font-family:var(--font-mono);font-size:0.78rem;font-weight:600;display:flex;align-items:center;gap:8px;">
              ${_escHtml(k.name)} 
              ${k.revoked_at ? '<span class="status-badge" style="background:var(--red-dim);color:var(--red);">Revoked</span>' : ''}
            </div>
            <div style="font-family:var(--font-mono);font-size:0.62rem;color:var(--fg-4);margin-top:3px;">
              Created: ${new Date(k.created_at).toLocaleDateString()}
              ${k.last_used_at ? ` · Last Used: ${new Date(k.last_used_at).toLocaleDateString()}` : ' · Never Used'}
            </div>
          </div>
          ${!k.revoked_at ? `<button class="btn btn-ghost btn-sm" style="color:var(--red);" onclick="App.revokeApiKey('${k.id}')">Revoke</button>` : ''}
        </div>
      `).join('');
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--red);">Failed to load keys: ${err.message}</p>`;
    }
  }

  async function generateApiKey() {
    const name = await Dialog.prompt('Enter a name for the new API key:');
    if (!name) return;
    try {
      const { data } = await API.keys.create({ name });
      document.getElementById('api-key-reveal').classList.remove('hidden');
      document.getElementById('api-key-value').textContent = data.key;
      await loadApiKeys();
      showToast('API Key generated successfully');
    } catch (err) {
      showToast(`Failed to generate key: ${err.message}`, 'error');
    }
  }

  async function revokeApiKey(id) {
    if (!(await Dialog.confirm('Are you sure you want to revoke this API key? Any scripts using it will immediately fail.'))) return;
    try {
      await API.keys.revoke(id);
      showToast('API Key revoked');
      await loadApiKeys();
    } catch (err) {
      showToast(`Failed to revoke key: ${err.message}`, 'error');
    }
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { boot, onLogin, switchTab, toggleUserMenu, showSettings, hideSettings, saveSettings, onProxyModeChange, loadApiKeys, generateApiKey, revokeApiKey };
})();

// ── Toast helper (global) ──────────────────────────────────────────────────

function showToast(msg, type = 'success') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = (type === 'error' ? '✕ ' : '✓ ') + msg;
  el.className = '';
  el.classList.add(type === 'error' ? 'error' : 'success', 'visible');
  clearTimeout(el._timer);
  el._timer = setTimeout(() => el.classList.remove('visible'), 3200);
}

// ── Start ──────────────────────────────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => App.boot());

window.addEventListener('popstate', (e) => {
  if (e.state && e.state.tab) {
    App.switchTab(e.state.tab, false);
  } else {
    const route = window.location.pathname.substring(1) || 'power';
    App.switchTab(route, false);
  }
});
