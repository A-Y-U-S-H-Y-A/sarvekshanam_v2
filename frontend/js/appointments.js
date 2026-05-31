'use strict';

/* ── Appointments module ─────────────────────────────────────────────────── */

const Appointments = (() => {
  let _activeId = null;
  let _appointments = [];

  async function init() {
    await fetchAll();
    
    // Auto-select the most recent active appointment, or create one if none exist
    if (_appointments.length > 0) {
      setActive(_appointments[0].id);
    }
  }

  async function fetchAll() {
    try {
      const res = await API.appointments.list();
      _appointments = res.appointments || [];
      _appointments.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      renderDropdown();
      renderList();
    } catch (err) {
      console.error('Failed to load appointments:', err);
    }
  }

  function showCreateModal() {
    document.getElementById('new-appointment-form').reset();
    document.getElementById('appt-name-input').value = `Session ${new Date().toLocaleString()}`;
    const _am = document.getElementById('new-appointment-modal'); _am.classList.remove('hidden'); _am.style.display = 'flex';
  }

  function hideCreateModal() {
    const _ah = document.getElementById('new-appointment-modal'); _ah.classList.add('hidden'); _ah.style.display = 'none';
  }

  async function submitCreate(e) {
    e.preventDefault();
    const name = document.getElementById('appt-name-input').value.trim();
    const mode = document.getElementById('appt-mode-input').value;
    if(!name) return;

    try {
      const res = await API.appointments.create({ name, mode });
      await fetchAll();
      if (res && res.appointment) {
        setActive(res.appointment.id);
      }
      hideCreateModal();
      showToast('New appointment created');
    } catch (err) {
      showToast(`Failed to create appointment: ${err.message}`, 'error');
    }
  }

  function setActive(id) {
    const changed = _activeId !== id;
    _activeId = id;
    renderDropdown();
    
    // Notify other modules
    if (changed && typeof AIChat !== 'undefined') {
      AIChat.setAppointmentId(id);
      
      // Auto-attach scans to AI context
      if (id) {
        API.appointments.scans(id)
          .then(res => {
            AIChat.clearAttachedSessions();
            const scans = res.scans || [];
            for (const s of scans) {
              AIChat.attachSessionId(s.id);
            }
          })
          .catch(err => console.error('Failed to auto-attach scans to AI context', err));
      } else {
        AIChat.clearAttachedSessions();
      }
    }

    if (typeof PowerUser !== 'undefined' && PowerUser.refreshSessions) {
      PowerUser.refreshSessions();
    }

    // Update active context badge
    const badge = document.getElementById('active-appointment-badge');
    const badgeLabel = document.getElementById('active-appointment-badge-label');
    if (badge && badgeLabel) {
      const appt = _appointments.find(a => a.id === id);
      badgeLabel.textContent = appt ? `📎 Context: ${appt.name}` : 'No Active Context';
    }
  }

  function getActive() {
    return _activeId;
  }

  function renderDropdown() {
    const sel = document.getElementById('appointment-selector');
    if (!sel) return;
    
    sel.innerHTML = _appointments.map(a => 
      `<option value="${_escHtml(a.id)}">${_escHtml(a.name)}</option>`
    ).join('');
    
    if (_activeId) {
      sel.value = _activeId;
    }
  }

  function renderList() {
    const listEl = document.getElementById('appointments-list');
    if (!listEl) return;

    if (_appointments.length === 0) {
      listEl.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;" style="grid-column:1/-1;padding:16px;">No appointments found. Create one to begin.</p>';
      return;
    }

    listEl.innerHTML = _appointments.map(a => `
      <div class="appointment-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <span class="appt-name">${_escHtml(a.name)}</span>
          <span class="status-badge">${_escHtml(a.mode)}</span>
        </div>
        <div class="appt-meta">
          <span>📅 ${_relTime(a.createdAt)}</span>
        </div>
        <div style="display:flex;gap:6px;padding-top:10px;border-top:1px solid var(--border);margin-top:auto;">
          <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="Appointments.viewDetail('${_escInline(a.id)}')">View</button>
          <button class="btn btn-primary btn-sm" style="flex:1;" onclick="Appointments.setActive('${_escInline(a.id)}');showToast('Context set to ${_escInline(a.name)}')">Active</button>
          ${Auth.getUser()?.role === 'admin' ? `<button class="btn btn-danger btn-sm" style="flex:0;" onclick="Appointments.deleteAppointment('${_escInline(a.id)}')" title="Delete">🗑️</button>` : ''}
        </div>
      </div>
    `).join('');
  }

  async function deleteAppointment(id) {
    if (!(await Dialog.confirm('Are you sure you want to delete this appointment? It will be moved to Trash.'))) return;
    try {
      await API.appointments.delete(id);
      showToast('Appointment moved to Trash');
      if (_activeId === id) setActive(null);
      await fetchAll();
    } catch (err) {
      showToast('Failed to delete appointment: ' + err.message, 'error');
    }
  }

  async function viewDetail(id) {
    const appt = _appointments.find(a => a.id === id);
    if (!appt) return;

    document.getElementById('appt-detail-title').textContent = `Details: ${appt.name}`;
    const detailPanel = document.getElementById('appointment-detail');
    detailPanel.classList.remove('hidden');
    setTimeout(() => detailPanel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);

    const scansList = document.getElementById('appt-scans-list');
    const chatsList = document.getElementById('appt-chats-list');
    scansList.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Loading…</p>';
    chatsList.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Loading…</p>';

    try {
      const [scansRes, chatsRes] = await Promise.all([
        API.appointments.scans(id),
        API.appointments.chats(id)
      ]);
      const scans = scansRes.scans || [];
      const chats = chatsRes.chats || [];

      if (scans.length === 0) {
        scansList.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No scans linked.</p>';
      } else {
        scansList.innerHTML = scans.map(s => `
          <div style="padding:10px 12px;border:1px solid var(--border);background:var(--bg-3);margin-bottom:6px;display:flex;flex-direction:column;gap:6px;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:8px;">
              <span style="font-family:var(--font-mono);font-size:0.78rem;color:var(--fg);">${_escHtml(s.name)}</span>
              <span class="status-badge status-${s.status}">${s.status}</span>
            </div>
            <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">${_relTime(s.createdAt)}</div>
          </div>
        `).join('');
      }

      if (chats.length === 0) {
        chatsList.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No chats yet.</p>';
      } else {
        chatsList.innerHTML = chats.map(c => `
          <div style="padding:10px 12px;border:1px solid var(--border);background:var(--bg-3);margin-bottom:6px;display:flex;flex-direction:column;gap:6px;">
            <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--fg-2);">${_escHtml(c.provider)} — ${_escHtml(c.model)}</div>
            <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">${_relTime(c.createdAt)}</div>
          </div>
        `).join('');
      }
    } catch (err) {
      showToast(`Failed to load details: ${err.message}`, 'error');
    }
  }

  function hideDetail() {
    document.getElementById('appointment-detail').classList.add('hidden');
  }

  function _escHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _escInline(str) {
    if (!str) return '';
    return _escHtml(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }

  function _relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  }

  // Create one on init if none exists? No, changed to just select first.
  async function createNew() {
    showCreateModal();
  }

  return { init, fetchAll, showCreateModal, hideCreateModal, submitCreate, setActive, getActive, viewDetail, hideDetail, createNew, deleteAppointment };
})();
