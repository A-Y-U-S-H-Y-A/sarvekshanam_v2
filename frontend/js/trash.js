'use strict';

class TrashManager {
  constructor() {
    this.container = document.getElementById('trash-container');
  }

  async init() {
    if (!Auth || !Auth.getUser() || Auth.getUser().role !== 'admin') {
      if (this.container) {
        this.container.innerHTML = '<p class="error">Access Denied: Admins only.</p>';
      }
      return;
    }
    
    await this.loadTrash();

    // Auto refresh every minute to update countdowns
    setInterval(() => this.loadTrash(), 60000);
  }

  async loadTrash() {
    try {
      this.container.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Loading trash\u2026</p>';
      const res = await fetch('/api/trash', {
        headers: {
          'Authorization': `Bearer ${Auth.getToken()}`
        }
      });
      if (!res.ok) {
        let errStr = 'Failed to load trash';
        try { const errData = await res.json(); if (errData.error) errStr = typeof errData.error === 'string' ? errData.error : errData.error.message || errStr; } catch(e) {}
        throw new Error(errStr);
      }
      const data = await res.json();
      this.render(data);
    } catch (err) {
      console.error(err);
      this.container.innerHTML = `<p class="error">Error loading trash: ${Utils.escHtml(err.message)}</p>`;
    }
  }

  render(trashData) {
    if (Object.keys(trashData).length === 0) {
      this.container.innerHTML = `
        <div class="empty-state-layout">
          <div class="icon" style="font-size:3rem;margin-bottom:10px;">✨</div>
          <h3 style="margin-bottom:8px;">Trash is empty</h3>
          <p style="margin-bottom:16px;">It looks like everything is clean. Items deleted will appear here for 1 hour before permanent deletion.</p>
          <button class="btn btn-primary" onclick="App.switchTab('power')">Return to Dashboard</button>
        </div>
      `;
      return;
    }

    let html = '';
    const now = new Date();

    for (const [model, records] of Object.entries(trashData)) {
      html += `<div>
        <div class="trash-category-title">${Utils.escHtml(model)}s pending deletion</div>
        <div class="trash-grid">`;

      for (const r of records) {
        const deletedAt = new Date(r.deleted_at);
        const scheduledFor = new Date(deletedAt.getTime() + 60 * 60 * 1000);
        const remainingMs = scheduledFor.getTime() - now.getTime();
        
        let timeRemaining = 'Pending cleanup\u2026';
        if (remainingMs > 0) {
          const mins = Math.floor(remainingMs / 60000);
          timeRemaining = `${mins} min`;
        }

        const name = r.name || r.url || r.command || r.username || (r.id ? r.id.split('-')[0] : 'Unknown');
        const statusClass = remainingMs <= 0 ? 'status-failed' : 'status-pending';

        html += `
          <div class="trash-item" data-id="${Utils.escHtml(r.id)}">
            <div class="trash-item-header">
              <span class="trash-item-name">${Utils.escHtml(name)}</span>
              <span class="status-badge ${statusClass}">${timeRemaining}</span>
            </div>
            <div class="trash-item-meta">Deleted: ${deletedAt.toLocaleString()}</div>
            <div class="trash-item-actions">
              <button class="btn btn-ghost btn-sm" style="flex:1;" onclick="trashManager.restore('${Utils.escHtml(model)}', '${Utils.escHtml(r.id)}')">Restore</button>
              <button class="btn btn-danger btn-sm" style="flex:1;" onclick="trashManager.forceDelete('${Utils.escHtml(model)}', '${Utils.escHtml(r.id)}')" title="Delete Permanently">Erase</button>
            </div>
          </div>
        `;
      }
      html += `</div></div>`;
    }

    this.container.innerHTML = html;
  }

  async restore(model, id) {
    if (!(await Dialog.confirm('Are you sure you want to restore this item?'))) return;
    
    const itemEl = this.container.querySelector(`.trash-item[data-id="${id}"]`);
    if (itemEl) itemEl.style.opacity = '0.5';

    try {
      const res = await fetch(`/api/trash/${model}/${id}/restore`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to restore');
      if (itemEl) itemEl.remove();
      this.loadTrash();
    } catch (err) {
      if (itemEl) itemEl.style.opacity = '1';
      if (typeof window.showError === 'function') window.showError(err);
      else Dialog.alert(err.message);
    }
  }

  async forceDelete(model, id) {
    if (!(await Dialog.confirm('This will PERMANENTLY delete the item immediately. Continue?'))) return;
    
    const itemEl = this.container.querySelector(`.trash-item[data-id="${id}"]`);
    if (itemEl) itemEl.style.opacity = '0.5';

    try {
      const res = await fetch(`/api/trash/${model}/${id}/force`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${Auth.getToken()}` }
      });
      if (!res.ok) throw new Error('Failed to force delete');
      if (itemEl) itemEl.remove();
      this.loadTrash();
    } catch (err) {
      if (itemEl) itemEl.style.opacity = '1';
      if (typeof window.showError === 'function') window.showError(err);
      else Dialog.alert(err.message);
    }
  }
}

let trashManager;
document.addEventListener('DOMContentLoaded', () => {
  trashManager = new TrashManager();
});
