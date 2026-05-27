'use strict';

const { ModuleRegistry, _resetRegistry } = require('../../src/modules/registry');

describe('ModuleRegistry', () => {
  afterEach(() => _resetRegistry());

  it('should load at least 2 modules', () => {
    const registry = new ModuleRegistry();
    expect(registry.size).toBeGreaterThanOrEqual(2);
  });

  it('getAll() returns array of module meta objects', () => {
    const registry = new ModuleRegistry();
    const all      = registry.getAll();
    expect(Array.isArray(all)).toBe(true);
    all.forEach(m => {
      expect(m).toHaveProperty('id');
      expect(m).toHaveProperty('name');
      expect(m).toHaveProperty('category');
      expect(Array.isArray(m.parameters)).toBe(true);
    });
  });

  it('getByCategory() groups modules correctly', () => {
    const registry = new ModuleRegistry();
    const grouped  = registry.getByCategory();
    expect(typeof grouped).toBe('object');
    // Both nmap modules should be in 'Network'
    expect(grouped).toHaveProperty('Network');
    expect(grouped['Network'].length).toBeGreaterThanOrEqual(2);
  });

  it('getById() returns the correct module instance', () => {
    const registry = new ModuleRegistry();
    const mod      = registry.getById('nmap-quick-scan');
    expect(mod).toBeDefined();
    expect(mod.meta.id).toBe('nmap-quick-scan');
  });

  it('getById() returns undefined for unknown id', () => {
    const registry = new ModuleRegistry();
    expect(registry.getById('non-existent')).toBeUndefined();
  });
});
