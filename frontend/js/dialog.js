'use strict';

const Dialog = (() => {
  let _resolve = null;

  function _show(title, message, type, defaultValue = '') {
    return new Promise(resolve => {
      _resolve = resolve;
      
      const modal = document.getElementById('global-dialog-modal');
      const titleEl = document.getElementById('global-dialog-title');
      const msgEl = document.getElementById('global-dialog-message');
      const inputEl = document.getElementById('global-dialog-input');
      const cancelBtn = document.getElementById('global-dialog-cancel');
      const confirmBtn = document.getElementById('global-dialog-confirm');

      titleEl.textContent = title;
      msgEl.innerHTML = String(message).replace(/\n/g, '<br>');
      
      inputEl.value = defaultValue;
      inputEl.classList.toggle('hidden', type !== 'prompt');
      cancelBtn.classList.toggle('hidden', type === 'alert');

      // Add a slight delay before showing to ensure any previous transitions finish
      setTimeout(() => {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        if (type === 'prompt') {
          inputEl.focus();
        } else {
          confirmBtn.focus();
        }
      }, 10);
    });
  }

  function _close(result) {
    const modal = document.getElementById('global-dialog-modal');
    modal.classList.add('hidden');
    modal.style.display = 'none';
    if (_resolve) {
      _resolve(result);
      _resolve = null;
    }
  }

  function init() {
    const cancelBtn = document.getElementById('global-dialog-cancel');
    const confirmBtn = document.getElementById('global-dialog-confirm');
    const inputEl = document.getElementById('global-dialog-input');

    if (cancelBtn) cancelBtn.addEventListener('click', () => _close(false));
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => {
        const isPrompt = !inputEl.classList.contains('hidden');
        _close(isPrompt ? inputEl.value : true);
      });
    }
    if (inputEl) {
      inputEl.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          _close(inputEl.value);
        } else if (e.key === 'Escape') {
          _close(null);
        }
      });
    }
  }

  // Public API
  return {
    init,
    alert: (message, title = 'Notification') => _show(title, message, 'alert'),
    confirm: (message, title = 'Confirmation') => _show(title, message, 'confirm'),
    prompt: (message, defaultValue = '', title = 'Input Required') => _show(title, message, 'prompt', defaultValue)
  };
})();

document.addEventListener('DOMContentLoaded', () => {
  Dialog.init();
});
