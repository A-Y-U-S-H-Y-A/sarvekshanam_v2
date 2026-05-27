'use strict';

const config = require('../config');

/**
 * ProxyService
 *
 * Handles multi-system proxy routing for module execution.
 *
 * Topology A (hop):    Browser → Backend (B) → Proxy/Jump (C) → Target
 * Topology B (direct): Browser → Proxy/Jump (C) → Target  [B co-located with A]
 *
 * In 'hop' mode, nmap and other tools are invoked with HTTP_PROXY / HTTPS_PROXY
 * env vars pointing to System C, so outbound module traffic routes through C.
 *
 * In 'direct' mode, the proxy env vars are set so the browser/frontend routes
 * directly through C (backend is effectively passthrough).
 *
 * In 'none' mode (default), all execution is local – no proxying.
 */
class ProxyService {
  constructor() {
    this.mode   = config.proxyMode;   // none | hop | direct
    this.target = config.proxyTarget; // e.g. http://192.168.1.10:8080
  }

  /**
   * Returns process environment overrides to inject into child_process.exec calls
   * so that module traffic is routed through the proxy target.
   *
   * @returns {object} env patch (empty object in 'none' mode)
   */
  getExecEnv() {
    if (this.mode === 'none' || !this.target) return {};

    return {
      HTTP_PROXY:  this.target,
      HTTPS_PROXY: this.target,
      http_proxy:  this.target,
      https_proxy: this.target,
    };
  }

  /**
   * Returns proxy info to surface in the API response.
   */
  getInfo() {
    return {
      mode:          this.mode,
      target:        this.target || null,
      active:        this.mode !== 'none' && !!this.target,
      description:   this._describe(),
    };
  }

  _describe() {
    if (this.mode === 'none')   return 'All module execution is local.';
    if (this.mode === 'hop')    return `System B routes module traffic through ${this.target} → Target.`;
    if (this.mode === 'direct') return `Module traffic routes directly via ${this.target} → Target.`;
    return '';
  }
}

let _instance = null;
function getProxyService() {
  if (!_instance) _instance = new ProxyService();
  return _instance;
}
function _resetProxyService() { _instance = null; }

module.exports = { getProxyService, ProxyService, _resetProxyService };
