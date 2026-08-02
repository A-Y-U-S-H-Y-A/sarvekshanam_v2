'use strict';

const Utils = {
  escHtml(str) {
    if (str == null) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  },
  debounce(func, wait) {
    let timeout;
    return function (...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => func.apply(this, args), wait);
    };
  },
  relTime(iso) {
    if (!iso) return '';
    const diff = (Date.now() - new Date(iso)) / 1000;
    if (diff < 60) return 'just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(iso).toLocaleDateString();
  },
  async withLoading(btn, actionPromise) {
    if (!btn || btn.disabled) return;
    
    const originalText = btn.innerHTML;
    const originalWidth = btn.offsetWidth;
    btn.disabled = true;
    btn.style.minWidth = originalWidth + 'px';
    
    const isUnknown = btn.hasAttribute('data-unknown-progress');
    let step = 0;
    let interval;
    
    const setHtml = (text) => {
      btn.innerHTML = `<span class="spinner-inline"></span> ${text}`;
    };
    
    setHtml(btn.getAttribute('data-loading-text') || 'Loading...');
    
    if (isUnknown) {
      const steps = ['Starting...', 'Almost there...', 'Just a moment more...'];
      setHtml(steps[0]);
      interval = setInterval(() => {
        step++;
        if (step < steps.length) {
          setHtml(steps[step]);
        } else if (step === steps.length) {
          btn.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;padding:0 10px;gap:8px;">
                             <span style="font-size:0.75rem;">Processing...</span>
                             <div style="flex:1;height:4px;background:rgba(255,255,255,0.2);border-radius:2px;overflow:hidden;position:relative;">
                               <div style="position:absolute;top:0;left:0;height:100%;background:var(--primary);animation:indeterminate 1.5s infinite linear;width:50%;"></div>
                             </div>
                           </div>`;
          if (!document.getElementById('indeterminate-anim')) {
             const style = document.createElement('style');
             style.id = 'indeterminate-anim';
             style.textContent = `@keyframes indeterminate { 0% { left: -50%; } 100% { left: 100%; } }`;
             document.head.appendChild(style);
          }
        }
      }, 3333);
    }
    
    try {
      if (typeof actionPromise === 'function') {
        await actionPromise();
      } else {
        await actionPromise;
      }
    } finally {
      if (interval) clearInterval(interval);
      btn.disabled = false;
      btn.innerHTML = originalText;
      btn.style.minWidth = '';
    }
  }
};

const FormUtils = {
  setupValidation(formId) {
    const form = document.getElementById(formId);
    if (!form) return;
    const submitBtn = form.querySelector('[type="submit"]');
    if (!submitBtn) return;

    const inputs = form.querySelectorAll('input[required], select[required], textarea[required]');
    
    const checkValidity = () => {
      let isValid = true;
      inputs.forEach(input => {
        if (!input.checkValidity()) isValid = false;
      });
      submitBtn.disabled = !isValid;
    };

    inputs.forEach(input => {
      input.addEventListener('input', checkValidity);
      input.addEventListener('change', checkValidity);
      input.addEventListener('blur', () => {
        if (!input.checkValidity()) {
          input.classList.add('invalid');
          
          let errorEl = input.nextElementSibling;
          if (!errorEl || !errorEl.classList.contains('inline-error')) {
            errorEl = document.createElement('span');
            errorEl.className = 'inline-error';
            input.parentNode.insertBefore(errorEl, input.nextSibling);
          }
          errorEl.textContent = input.validationMessage || 'This field is required.';
        } else {
          input.classList.remove('invalid');
          const errorEl = input.nextElementSibling;
          if (errorEl && errorEl.classList.contains('inline-error')) {
            errorEl.remove();
          }
        }
      });
    });

    const passwordInput = form.querySelector('input[type="password"]');
    if (passwordInput) {
      const checklist = form.querySelector('.password-checklist');
      if (checklist) {
        passwordInput.addEventListener('focus', () => {
          if (typeof Auth !== 'undefined' && Auth.getMode() === 'login') return;
          checklist.classList.remove('hidden');
        });
        passwordInput.addEventListener('blur', () => {
          if (passwordInput.checkValidity() || (typeof Auth !== 'undefined' && Auth.getMode() === 'login')) checklist.classList.add('hidden');
        });
        passwordInput.addEventListener('input', () => {
          if (typeof Auth !== 'undefined' && Auth.getMode() === 'login') {
            passwordInput.setCustomValidity('');
            checkValidity();
            return;
          }

          const val = passwordInput.value;
          const reqLength = checklist.querySelector('.req-length');
          const reqUpper = checklist.querySelector('.req-upper');
          const reqNumber = checklist.querySelector('.req-number');
          
          if (val.length >= 8) reqLength.classList.add('met'); else reqLength.classList.remove('met');
          if (/[A-Z]/.test(val)) reqUpper.classList.add('met'); else reqUpper.classList.remove('met');
          if (/[0-9]/.test(val)) reqNumber.classList.add('met'); else reqNumber.classList.remove('met');
          
          if (val.length < 8 || !/[A-Z]/.test(val) || !/[0-9]/.test(val)) {
             passwordInput.setCustomValidity('Password does not meet requirements');
          } else {
             passwordInput.setCustomValidity('');
          }
          checkValidity();
        });
      }
    }

    checkValidity(); // Initial check
  }
};
