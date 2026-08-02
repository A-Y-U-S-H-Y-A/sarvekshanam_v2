'use strict';

const HistoryModal = (() => {
  let _currentPage = 1;
  const PAGE_SIZE = 10;
  let _totalPages = 1;
  let _totalItems = 0;

  function show() {
    const modal = document.getElementById('history-modal');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    load(1);
  }

  function hide() {
    const modal = document.getElementById('history-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
  }

  async function load(page = 1) {
    _currentPage = page;
    const listContainer = document.getElementById('history-list-container');
    listContainer.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">Loading history...</p>';

    const mode = document.getElementById('history-filter-mode')?.value;
    const status = document.getElementById('history-filter-status')?.value;
    const appointmentId = typeof Appointments !== 'undefined' ? Appointments.getActive() : undefined;

    try {
      const qs = { page: _currentPage, limit: PAGE_SIZE, grouped: 'true' };
      if (mode) qs.mode = mode;
      if (status) qs.status = status;
      if (appointmentId) qs.appointmentId = appointmentId;

      const data = await API.scans.list(qs);
      _totalItems = data.total || 0;
      _totalPages = Math.ceil(_totalItems / PAGE_SIZE) || 1;

      render(data.sessions || []);
      updateControls();
    } catch (err) {
      listContainer.innerHTML = `<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--accent-red);font-style:italic;">Failed to load history: ${Utils.escHtml(err.message)}</p>`;
    }
  }

  function render(sessions) {
    const listContainer = document.getElementById('history-list-container');
    if (!sessions.length) {
      listContainer.innerHTML = '<p style="padding:16px;font-family:var(--font-mono);font-size:0.72rem;color:var(--fg-4);font-style:italic;">No scans found.</p>';
      return;
    }

    // Rely on BulkScan's getGroupedHtml for grouping bulk scans nicely
    if (typeof BulkScan !== 'undefined') {
      listContainer.innerHTML = BulkScan.getGroupedHtml(sessions, {
        allowRelaunch: true,
        onClickItem: 'PowerUser.viewSession'
      });
    } else {
      listContainer.innerHTML = '<p style="color:var(--accent-red);">BulkScan module not loaded.</p>';
    }
  }

  function updateControls() {
    const info = document.getElementById('history-page-info');
    if (info) info.textContent = `Page ${_currentPage} of ${_totalPages} (Total: ${_totalItems})`;

    const prevBtn = document.getElementById('history-page-prev');
    if (prevBtn) prevBtn.disabled = _currentPage <= 1;
    
    const nextBtn = document.getElementById('history-page-next');
    if (nextBtn) nextBtn.disabled = _currentPage >= _totalPages;
  }

  function prevPage() {
    if (_currentPage > 1) {
      load(_currentPage - 1);
    }
  }

  function nextPage() {
    if (_currentPage < _totalPages) {
      load(_currentPage + 1);
    }
  }

  return { show, hide, load, prevPage, nextPage };
})();
