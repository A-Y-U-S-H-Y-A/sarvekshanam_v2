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
      `<option value="${Utils.escHtml(a.id)}">${Utils.escHtml(a.name)}</option>`
    ).join('');
    
    if (_activeId) {
      sel.value = _activeId;
    }
  }

  function renderList() {
    const listEl = document.getElementById('appointments-list');
    if (!listEl) return;

    if (_appointments.length === 0) {
      listEl.innerHTML = `
        <div class="empty-state-layout">
          <div class="icon" style="font-size:3rem;margin-bottom:10px;">🎉</div>
          <h3 style="margin-bottom:8px;">No appointments yet!</h3>
          <p style="margin-bottom:16px;">Everything is running perfectly. Create your first appointment context to organize your scans.</p>
          <button class="btn btn-primary" onclick="Appointments.showCreateModal()">Create Appointment</button>
        </div>
      `;
      return;
    }

    listEl.innerHTML = _appointments.map(a => `
      <div class="appointment-card">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:8px;">
          <span class="appt-name">${Utils.escHtml(a.name)}</span>
          <span class="status-badge">${Utils.escHtml(a.mode)}</span>
        </div>
        <div class="appt-meta">
          <span>📅 ${Utils.relTime(a.createdAt)}</span>
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
    
    // Optimistic rendering
    const originalAppointments = [..._appointments];
    const originalActive = _activeId;
    
    _appointments = _appointments.filter(a => a.id !== id);
    if (_activeId === id) setActive(_appointments[0]?.id || null);
    renderList();
    
    try {
      await API.appointments.delete(id);
      showToast('Appointment moved to Trash');
    } catch (err) {
      // Rollback
      _appointments = originalAppointments;
      setActive(originalActive);
      renderList();
      if (typeof window.showError === 'function') window.showError(err);
      else showToast('Failed to delete appointment: ' + err.message, 'error');
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
        scansList.innerHTML = typeof BulkScan !== 'undefined' ? BulkScan.getGroupedHtml(scans) : '';
      }

      if (chats.length === 0) {
        chatsList.innerHTML = '<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No chats yet.</p>';
      } else {
        chatsList.innerHTML = chats.map(c => `
          <div style="padding:10px 12px;border:1px solid var(--border);background:var(--bg-3);margin-bottom:6px;display:flex;flex-direction:column;gap:6px;">
            <div style="font-family:var(--font-mono);font-size:0.75rem;color:var(--fg-2);">${Utils.escHtml(c.provider)} — ${Utils.escHtml(c.model)}</div>
            <div style="font-family:var(--font-mono);font-size:0.65rem;color:var(--fg-4);">${Utils.relTime(c.createdAt)}</div>
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

  

  function _escInline(str) {
    if (!str) return '';
    return Utils.escHtml(str)
      .replace(/\\/g, '\\\\')
      .replace(/'/g, '\\\'')
      .replace(/\n/g, '\\n')
      .replace(/\r/g, '\\r');
  }



  // Create one on init if none exists? No, changed to just select first.
  async function createNew() {
    showCreateModal();
  }

  return { init, fetchAll, showCreateModal, hideCreateModal, submitCreate, setActive, getActive, viewDetail, hideDetail, createNew, deleteAppointment };
})();
