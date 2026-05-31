'use strict';

/**
 * BaseModule – Abstract base class for all Sarvekshanam scan modules.
 *
 * Subclasses MUST override:
 *   - get meta()  → { id, name, description, category, parameters[] }
 *   - async run(params, options)  → { status, output, raw, timestamp }
 */
class BaseModule {
  /**
   * Module metadata.
   * @returns {{
   *   id: string,
   *   name: string,
   *   description: string,
   *   category: string,
   *   parameters: Array<{name: string, type: string, required: boolean, description: string, default?: any}>
   * }}
   */
  get meta() {
    throw new Error(`${this.constructor.name} must implement get meta()`);
  }

  /**
   * Execute the module.
   * @param {Object} params  – User-supplied parameter values
   * @param {Object} options – Runtime options { proxyConfig, mockMode, timeout }
   * @returns {Promise<{status: 'success'|'error'|'partial', output: string, raw: any, timestamp: string}>}
   */
  async run(_params, _options = {}) {
    throw new Error(`${this.constructor.name} must implement run()`);
  }

  /**
   * Validate params against meta.parameters schema.
   * Returns an array of validation error strings (empty = valid).
   * @param {Object} params
   * @returns {string[]}
   */
  validate(params) {
    const errors = [];
    for (const param of this.meta.parameters) {
      if (param.required && (params[param.name] === undefined || params[param.name] === null || params[param.name] === '')) {
        errors.push(`Parameter "${param.name}" is required`);
      }
    }
    return errors;
  }

  /**
   * Build a result object.
   * @param {'success'|'error'|'partial'} status
   * @param {string} output
   * @param {any} raw
   * @returns {{ status: string, output: string, raw: any, timestamp: string }}
   */
  _result(status, output, raw = null) {
    return { status, output, raw, timestamp: new Date().toISOString() };
  }
}

module.exports = BaseModule;
