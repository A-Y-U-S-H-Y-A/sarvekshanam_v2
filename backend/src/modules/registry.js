'use strict';

const fs         = require('fs');
const path       = require('path');
const BaseModule = require('./base/BaseModule');

/** Modules directory (excludes 'base/') */
const MODULES_DIR = path.join(__dirname);

let _registry = null;

/**
 * Module Registry — auto-discovers and indexes all module classes.
 *
 * Scans every subdirectory of src/modules/ (except 'base') for files
 * that export a class extending BaseModule.
 */
class ModuleRegistry {
  constructor() {
    /** @type {Map<string, BaseModule>} */
    this._modules = new Map();
    this._load();
  }

  /** Scan directory tree and register all modules. */
  _load() {
    // Disabled: Backend is no longer allowed to have scanning modules.
    // All modules must be remote modules executed by the Go Runner.
  }

  /**
   * Register a module instance dynamically at runtime.
   * @param {BaseModule} instance
   */
  registerDynamic(instance) {
    if (instance instanceof BaseModule) {
      this._modules.set(instance.meta.id, instance);
    }
  }

  /**
   * Remove all dynamic modules associated with a specific runner ID.
   * @param {string} runnerId
   */
  unregisterDynamicByRunner(runnerId) {
    const prefix = `remote_${runnerId}_`;
    for (const id of this._modules.keys()) {
      if (id.startsWith(prefix)) {
        this._modules.delete(id);
      }
    }
  }

  /** Return all registered modules' metadata. */
  getAll() {
    return Array.from(this._modules.values()).map(m => m.meta);
  }

  /** Return all modules grouped by category. */
  getByCategory() {
    const grouped = {};
    for (const m of this._modules.values()) {
      const cat = m.meta.category || 'Uncategorised';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(m.meta);
    }
    return grouped;
  }

  /**
   * Return the module instance for a given ID.
   * @param {string} id
   * @returns {BaseModule|undefined}
   */
  getById(id) {
    return this._modules.get(id);
  }

  /** Total number of registered modules. */
  get size() {
    return this._modules.size;
  }
}

/** Returns (and caches) the singleton registry. */
function getRegistry() {
  if (!_registry) _registry = new ModuleRegistry();
  return _registry;
}

/** Reset singleton — for tests. */
function _resetRegistry() {
  _registry = null;
}

module.exports = { getRegistry, ModuleRegistry, _resetRegistry };
