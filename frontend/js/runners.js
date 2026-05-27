const Runners = {
  list: [],
  groups: [],

  async load() {
    try {
      const [rData, gData] = await Promise.all([
        API.runners.list(),
        API.groups.list().catch(() => []) // Catch if endpoint not fully ready
      ]);
      this.list = rData;
      this.groups = gData;
      this.render();
      this.renderGroups();
    } catch (err) {
      console.error('Failed to load runners/groups', err);
      document.getElementById('runners-list').innerHTML = `<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--red);">Error loading runners: ${err.message}</p>`;
    }
  },

  renderGroups() {
    const listEl = document.getElementById('groups-list');
    if (!listEl) return;
    
    if (!this.groups || this.groups.length === 0) {
      listEl.innerHTML = `<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No groups yet. Groups form when runners share exact module manifests.</p>`;
      return;
    }

    listEl.innerHTML = this.groups.map(g => `
      <div class="group-card">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;">
          <h3 class="group-card-header" style="border:none;padding:0;margin:0;">
            🏢 ${g.name}
            <span class="status-badge status-online">Active</span>
          </h3>
          <span style="font-family:var(--font-mono);font-size:0.62rem;color:var(--fg-4);">${g.manifest_hash.substring(0,8)}</span>
        </div>
        <div>
          <p style="font-family:var(--font-mono);font-size:0.62rem;color:var(--fg-4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Load Distribution</p>
          <div style="height:3px;background:var(--surface);width:100%;overflow:hidden;">
            <div style="height:100%;background:var(--amber);transition:width 0.3s;" style="width:${Math.max(20, Math.random()*100)}%;"></div>
          </div>
        </div>
      </div>
    `).join('');
  },

  render() {
    const listEl = document.getElementById('runners-list');
    if (!this.list || this.list.length === 0) {
      listEl.innerHTML = `<p style="padding:14px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;grid-column:1/-1;">No runners configured. Add one to enable remote scanning.</p>`;
      return;
    }

    listEl.innerHTML = this.list.map(r => `
      <div class="runner-card">
        <div class="runner-card-header">
          <span class="runner-name">${r.name}</span>
          <div style="display:flex;gap:6px;align-items:center;">
            ${r.group ? `<span class="status-badge">${r.group}</span>` : ''}
            <span class="status-badge status-${r.status || 'offline'}">${r.status || 'unknown'}</span>
          </div>
        </div>
        <div >
          <p class="runner-url"><strong style="color:var(--fg-4);font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;">URL:</strong> ${r.url}</p>
          <p class="runner-stat"><strong style="color:var(--fg-4);font-size:0.6rem;text-transform:uppercase;letter-spacing:0.1em;">Last Seen:</strong> ${r.last_seen_at ? new Date(r.last_seen_at).toLocaleString() : 'Never'}</p>
          <div style="margin-top:8px;padding-top:8px;border-top:1px solid var(--border);">
            <div style="font-family:var(--font-mono);font-size:0.6rem;color:var(--fg-4);text-transform:uppercase;letter-spacing:0.1em;margin-bottom:6px;">Modules</div>
            <div style="display:flex;flex-wrap:wrap;gap:4px;">
              ${(r.modules && r.modules.length > 0) ? r.modules.map(m => `<span style="font-family:var(--font-mono);font-size:0.6rem;padding:2px 6px;background:var(--surface);border:1px solid var(--border);color:var(--fg-3);">${m.name}</span>`).join('') : '<span style="font-family:var(--font-mono);font-size:0.68rem;color:var(--fg-4);font-style:italic;">None/Disconnected</span>'}
            </div>
          </div>
        </div>
        <div style="padding:10px 16px;border-top:1px solid var(--border);display:flex;justify-content:flex-end;">
          <button class="btn btn-ghost btn-sm" onclick="Runners.delete('${r.id}')">🗑 Delete</button>
        </div>
      </div>
    `).join('');
  },

  showAddModal() {
    document.getElementById('add-runner-form').reset();
    const _rm = document.getElementById('add-runner-modal'); _rm.classList.remove('hidden'); _rm.style.display = 'flex';
  },

  hideAddModal() {
    const _rh = document.getElementById('add-runner-modal'); _rh.classList.add('hidden'); _rh.style.display = 'none';
  },

  async submitAddForm(e) {
    e.preventDefault();
    const name = document.getElementById('runner-name-input').value.trim();
    const url = document.getElementById('runner-url-input').value.trim();
    if(!name || !url) return;
    
    try {
      await API.runners.create({ name, url });
      this.hideAddModal();
      showToast('Remote runner added successfully');
      await this.load();
    } catch (err) {
      Dialog.alert(`Error creating runner: ${err.message}`);
    }
  },

  async create(data) {
    try {
      await API.runners.create(data);
      await this.load();
    } catch (err) {
      Dialog.alert(`Error creating runner: ${err.message}`);
    }
  },

  async delete(id) {
    if (!(await Dialog.confirm('Delete this remote runner?'))) return;
    try {
      await API.runners.delete(id);
      await this.load();
    } catch(err) {
      Dialog.alert(`Error deleting runner: ${err.message}`);
    }
  }
};
