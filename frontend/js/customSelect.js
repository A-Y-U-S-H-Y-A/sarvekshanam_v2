'use strict';

const CustomSelect = (() => {
  function init() {
    // Find all <select> elements that should be customized
    const selects = document.querySelectorAll('select.select-styled, select#appointment-selector, select#pu-runner-select, select#pu-proxy-mode, select#bulk-runner-select, select#bulk-proxy-mode, select#cmd-filter, select#appt-mode-input, select#setting-proxy-mode, select#ai-provider, select#ai-model');

    selects.forEach(selectEl => {
      // If already initialized, skip
      if (selectEl.nextElementSibling && selectEl.nextElementSibling.classList.contains('custom-select')) {
        _updateOptions(selectEl, selectEl.nextElementSibling);
        return;
      }

      // Hide the native select
      selectEl.style.display = 'none';

      // Create the custom container
      const wrapper = document.createElement('div');
      wrapper.className = 'custom-select';
      if (selectEl.classList.contains('select-styled')) {
        wrapper.classList.add('select-styled-wrapper');
      }
      if (selectEl.id === 'appointment-selector') {
        wrapper.classList.add('nav-select-wrapper');
      }
      
      // Selected value display
      const trigger = document.createElement('div');
      trigger.className = 'custom-select-trigger';
      const textSpan = document.createElement('span');
      textSpan.textContent = selectEl.options[selectEl.selectedIndex]?.text || '';
      const arrowSpan = document.createElement('span');
      arrowSpan.className = 'custom-select-arrow';
      arrowSpan.innerHTML = '▾'; // Down arrow
      
      trigger.appendChild(textSpan);
      trigger.appendChild(arrowSpan);

      // Options dropdown
      const optionsContainer = document.createElement('div');
      optionsContainer.className = 'custom-select-options hidden';

      wrapper.appendChild(trigger);
      wrapper.appendChild(optionsContainer);
      selectEl.parentNode.insertBefore(wrapper, selectEl.nextSibling);

      _updateOptions(selectEl, wrapper);

      // Handle click to open/close
      trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        
        // Close all other custom selects
        document.querySelectorAll('.custom-select').forEach(cs => {
          if (cs !== wrapper) cs.classList.remove('open');
          const opts = cs.querySelector('.custom-select-options');
          if (opts && cs !== wrapper) opts.classList.add('hidden');
        });

        wrapper.classList.toggle('open');
        optionsContainer.classList.toggle('hidden');
      });

      // Handle native select changes (e.g. from JS) to update our custom UI
      selectEl.addEventListener('change', () => {
        textSpan.textContent = selectEl.options[selectEl.selectedIndex]?.text || '';
        // Refresh options to highlight the selected one
        _updateOptions(selectEl, wrapper);
      });
      
      // Monkey patch the native select so when its innerHTML changes we update the custom select
      const originalObserver = new MutationObserver(() => {
        _updateOptions(selectEl, wrapper);
      });
      originalObserver.observe(selectEl, { childList: true });
    });

    // Close when clicking outside
    document.addEventListener('click', () => {
      document.querySelectorAll('.custom-select-options').forEach(opts => {
        opts.classList.add('hidden');
      });
      document.querySelectorAll('.custom-select').forEach(cs => {
        cs.classList.remove('open');
      });
    });
  }

  function _updateOptions(selectEl, wrapper) {
    const optionsContainer = wrapper.querySelector('.custom-select-options');
    const textSpan = wrapper.querySelector('.custom-select-trigger span');
    
    optionsContainer.innerHTML = '';
    textSpan.textContent = selectEl.options[selectEl.selectedIndex]?.text || '';

    let optIndex = 0;

    function renderOption(option, container) {
      const index = optIndex++;
      const optDiv = document.createElement('div');
      optDiv.className = 'custom-select-option';
      if (option.selected) optDiv.classList.add('selected');
      if (option.disabled) optDiv.classList.add('disabled');
      optDiv.textContent = option.text;
      
      optDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        if (option.disabled) return;
        
        selectEl.selectedIndex = index;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        
        wrapper.classList.remove('open');
        optionsContainer.classList.add('hidden');
      });
      
      container.appendChild(optDiv);
    }

    Array.from(selectEl.children).forEach(child => {
      if (child.tagName.toLowerCase() === 'optgroup') {
        const groupDiv = document.createElement('div');
        groupDiv.className = 'custom-select-group';
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'custom-select-group-label';
        labelDiv.style.fontWeight = 'bold';
        labelDiv.style.fontSize = '0.75rem';
        labelDiv.style.padding = '6px 12px 2px 12px';
        labelDiv.style.color = 'var(--fg-4)';
        labelDiv.style.textTransform = 'uppercase';
        labelDiv.style.letterSpacing = '0.05em';
        labelDiv.textContent = child.label;
        
        groupDiv.appendChild(labelDiv);
        
        Array.from(child.children).forEach(opt => {
          if (opt.tagName.toLowerCase() === 'option') {
            renderOption(opt, groupDiv);
          }
        });
        
        optionsContainer.appendChild(groupDiv);
      } else if (child.tagName.toLowerCase() === 'option') {
        renderOption(child, optionsContainer);
      }
    });
  }

  return { init };
})();

// Re-init periodically to catch any dynamically added selects
setInterval(() => CustomSelect.init(), 1000);

document.addEventListener('DOMContentLoaded', () => {
  CustomSelect.init();
});
