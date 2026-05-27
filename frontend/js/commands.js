'use strict';

/* ── Commands module ──────────────────────────────────────────────────────── */

const Commands = (() => {
  let _currentStatus = '';

  async function init() {
    await loadRunners();
    await refresh();
    WsClient.on('COMMAND_STATUS', () => refresh());
  }

  async function loadRunners() {
    try {
      const runners = await API.runners.list();
      const select = document.getElementById('cmd-runner');
      if (!select) return;
      select.innerHTML = '<option value="">Select Runner…</option>' + 
        runners.map(r => `<option value="${r.id}">${r.name} (${r.status})</option>`).join('');
    } catch (err) {
      console.error('Failed to load runners for commands:', err);
    }
  }

  async function submit() {
    const input   = document.getElementById('cmd-input');
    const runnerSelect = document.getElementById('cmd-runner');
    const command = input.value.trim();
    const runnerId = runnerSelect ? runnerSelect.value : null;

    if (!command) return;
    if (!runnerId) {
      showToast('Please select a runner first', 'error');
      return;
    }

    try {
      await API.commands.submit(command, runnerId);
      input.value = '';
      showToast('Command submitted — awaiting approval');
      await refresh();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  function filter(status) {
    _currentStatus = status;
    refresh();
  }

  async function refresh() {
    const listEl = document.getElementById('cmd-list');
    listEl.innerHTML = '<p style="padding:14px 20px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Loading…</p>';

    try {
      const params = { limit: 50 };
      if (_currentStatus) params.status = _currentStatus;
      const data = await API.commands.list(params);

      if (!data.commands?.length) {
        listEl.innerHTML = '<p style="padding:14px 20px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No commands found.</p>';
        return;
      }

      const user    = Auth.getUser();
      const isAdmin = user?.role === 'admin';

      listEl.innerHTML = data.commands.map(c => _itemHtml(c, isAdmin)).join('');
    } catch (err) {
      listEl.innerHTML = `<p style="padding:12px;font-family:var(--font-mono);font-size:0.72rem;color:var(--red);">Error: ${err.message}</p>`;
    }
  }

  function _itemHtml(c, isAdmin) {
    const statusIcon = { pending: '⏳', approved: '✅', rejected: '❌', executing: '⚙️', executed: '✅', failed: '💥' }[c.status] || '•';

    let actions = '';
    if (isAdmin && c.status === 'pending') {
      actions = `
        <div class="cmd-actions">
          <button class="btn btn-primary btn-sm" onclick="Commands.approve('${c.id}')">Approve</button>
          <button class="btn btn-ghost btn-sm" onclick="Commands.rejectPrompt('${c.id}')">Reject</button>
        </div>
      `;
    }

    const outputHtml = c.output
      ? `<div style="margin-top:10px;background:var(--bg-3);padding:10px 12px;border:1px solid var(--border);font-family:var(--font-mono);font-size:0.72rem;white-space:pre-wrap;overflow:auto;max-height:160px;color:var(--fg-2);">${_escHtml(c.output)}</div>`
      : c.error
      ? `<div style="margin-top:10px;background:var(--red-dim);padding:10px 12px;border:1px solid var(--red);font-family:var(--font-mono);font-size:0.72rem;white-space:pre-wrap;overflow:auto;max-height:160px;color:var(--red);">[Error] ${_escHtml(c.error)}</div>`
      : '';

    const reasonHtml = c.reason ? `<div style="margin-top:6px;font-family:var(--font-mono);font-size:0.65rem;color:var(--amber);border-left:2px solid var(--amber);padding-left:8px;">Reason: ${_escHtml(c.reason)}</div>` : '';

    return `
      <div class="cmd-item">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px;">
          <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
            <span class="text-lg">${statusIcon}</span>
            <span class="cmd-command" style="margin:0;" title="${_escHtml(c.command)}">${_escHtml(c.command)}</span>
            <span class="status-badge status-${c.status}">${c.status}</span>
          </div>
          <span class="cmd-meta">${_relTime(c.requestedAt)}</span>
        </div>
        <div class="cmd-meta">by ${_escHtml(c.username)}${c.resolvedBy ? ` · resolved by ${c.resolvedBy}` : ''}</div>
        ${reasonHtml}
        ${actions}
        ${outputHtml}
      </div>
    `;
  }

  async function approve(id) {
    try {
      await API.commands.approve(id);
      showToast('Command approved and executing…');
      await refresh();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  async function rejectPrompt(id) {
    const reason = await Dialog.prompt('Rejection reason (optional):');
    if (reason === null) return;       // cancelled
    rejectCommand(id, reason);
  }

  async function rejectCommand(id, reason) {
    try {
      await API.commands.reject(id, reason);
      showToast('Command rejected');
      await refresh();
    } catch (err) {
      showToast(`Failed: ${err.message}`, 'error');
    }
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60)    return 'just now';
    if (diff < 3600)  return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  return { init, submit, filter, refresh, approve, rejectPrompt };
})();
