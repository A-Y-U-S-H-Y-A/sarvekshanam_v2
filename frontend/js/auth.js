'use strict';

/* ── Auth module ──────────────────────────────────────────────────────────── */

const Auth = (() => {
  let _mode = 'login';   // 'login' | 'register'
  let _user = null;

  function setRedirectRoute(route) { sessionStorage.setItem('redirect_route', route); }
  function getRedirectRoute() { 
    const r = sessionStorage.getItem('redirect_route');
    sessionStorage.removeItem('redirect_route');
    return r; 
  }

  function getUser()  { return _user; }
  function getToken() { return sessionStorage.getItem('sarv_token'); }

  async function init() {
    // Check URL for OIDC tokens or errors first
    const params = new URLSearchParams(window.location.search);
    if (params.has('oidc_error')) {
      showError(`SSO Error: ${params.get('oidc_error')}`);
      window.history.replaceState({}, document.title, window.location.pathname);
    }
    if (params.has('oidc_token')) {
      sessionStorage.setItem('sarv_token', params.get('oidc_token'));
      window.history.replaceState({}, document.title, window.location.pathname);
    }

    // Check OIDC config status to show/hide the SSO button
    try {
      const oidcStatus = await API.auth.oidcStatus();
      if (oidcStatus.data.enabled) {
        const ssoSection = document.getElementById('sso-section');
        if (ssoSection) ssoSection.classList.remove('hidden');
      }
    } catch (oidcErr) { console.warn('Failed to check OIDC status:', oidcErr.message); }

    const token = getToken();
    if (!token) {
      showOverlay();
      return null;
    }
    
    try {
      const data = await API.auth.me();
      _user = data.user;
      hideOverlay();
      return _user;
    } catch (_authErr) {
      sessionStorage.removeItem('sarv_token');
      showOverlay();
      return null;
    }
  }

  function showOverlay() {
    document.getElementById('auth-overlay').style.display = 'flex';
    document.getElementById('app').classList.add('hidden');
  }

  function hideOverlay() {
    document.getElementById('auth-overlay').style.display = 'none';
    document.getElementById('app').classList.remove('hidden');
  }

  function showLogin() {
    _mode = 'login';
    document.getElementById('auth-tab-login').classList.add('active');
    document.getElementById('auth-tab-register').classList.remove('active');
    document.getElementById('auth-submit').textContent = 'Login';
    document.getElementById('auth-password').setAttribute('autocomplete', 'current-password');
    clearError();
  }

  function showRegister() {
    _mode = 'register';
    document.getElementById('auth-tab-register').classList.add('active');
    document.getElementById('auth-tab-login').classList.remove('active');
    document.getElementById('auth-submit').textContent = 'Create Account';
    document.getElementById('auth-password').setAttribute('autocomplete', 'new-password');
    clearError();
  }

  async function submit(e) {
    e.preventDefault();
    const username = document.getElementById('auth-username').value.trim();
    const password = document.getElementById('auth-password').value;
    const btn      = document.getElementById('auth-submit');
    btn.disabled   = true;
    btn.innerHTML = '<span>Please wait…</span>';
    clearError();

    try {
      let data;
      if (_mode === 'login') {
        data = await API.auth.login(username, password);
      } else {
        data = await API.auth.register(username, password);
      }
      sessionStorage.setItem('sarv_token', data.token);
      _user = data.user;
      hideOverlay();
      if (typeof App !== 'undefined') App.onLogin(_user);
    } catch (err) {
      showError(err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = _mode === 'login' ? 'Login' : 'Create Account';
    }
  }

  function logout() {
    sessionStorage.removeItem('sarv_token');
    _user = null;
    WsClient.disconnect();
    showOverlay();
    // Reset form
    document.getElementById('auth-username').value = '';
    document.getElementById('auth-password').value = '';
    showLogin();
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    el.textContent = msg;
    el.classList.remove('hidden');
  }

  function clearError() {
    const el = document.getElementById('auth-error');
    el.textContent = '';
    el.classList.add('hidden');
  }

  function loginSSO() {
    window.location.href = '/auth/oidc';
  }

  return { init, submit, logout, showLogin, showRegister, getUser, getToken, loginSSO, setRedirectRoute, getRedirectRoute };
})();
