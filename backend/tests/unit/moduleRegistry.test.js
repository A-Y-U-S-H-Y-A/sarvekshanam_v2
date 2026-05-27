'use strict';

const { ModuleRegistry, _resetRegistry } = require('../../src/modules/registry');
const BaseModule = require('../../src/modules/base/BaseModule');

class MockRemoteModule extends BaseModule {
  constructor(id, category) {
    super();
    this._meta = { id, name: `Mock ${id}`, category, parameters: [] };
  }
  get meta() {
    return this._meta;
  }
}

describe('ModuleRegistry', () => {
  afterEach(() => _resetRegistry());

  it('should be empty by default since local modules are disabled', () => {
    const registry = new ModuleRegistry();
    expect(registry.size).toBe(0);
  });

  it('registerDynamic() adds a module', () => {
    const registry = new ModuleRegistry();
    const mod = new MockRemoteModule('remote_123_test', 'Network');
    registry.registerDynamic(mod);
    expect(registry.size).toBe(1);
    expect(registry.getById('remote_123_test')).toBeDefined();
  });

  it('unregisterDynamicByRunner() removes modules for a specific runner', () => {
    const registry = new ModuleRegistry();
    registry.registerDynamic(new MockRemoteModule('remote_runnerA_1', 'Network'));
    registry.registerDynamic(new MockRemoteModule('remote_runnerA_2', 'Web'));
    registry.registerDynamic(new MockRemoteModule('remote_runnerB_1', 'Network'));
    
    expect(registry.size).toBe(3);
    
    registry.unregisterDynamicByRunner('runnerA');
    
    expect(registry.size).toBe(1);
    expect(registry.getById('remote_runnerB_1')).toBeDefined();
    expect(registry.getById('remote_runnerA_1')).toBeUndefined();
  });

  it('getAll() returns array of module meta objects', () => {
    const registry = new ModuleRegistry();
    registry.registerDynamic(new MockRemoteModule('remote_1', 'CatA'));
    const all = registry.getAll();
    expect(Array.isArray(all)).toBe(true);
    expect(all[0].id).toBe('remote_1');
  });

  it('getByCategory() groups modules correctly', () => {
    const registry = new ModuleRegistry();
    registry.registerDynamic(new MockRemoteModule('remote_1', 'CatA'));
    registry.registerDynamic(new MockRemoteModule('remote_2', 'CatA'));
    registry.registerDynamic(new MockRemoteModule('remote_3', 'CatB'));
    
    const grouped = registry.getByCategory();
    expect(grouped).toHaveProperty('CatA');
    expect(grouped['CatA'].length).toBe(2);
    expect(grouped).toHaveProperty('CatB');
    expect(grouped['CatB'].length).toBe(1);
  });

  it('getById() returns undefined for unknown id', () => {
    const registry = new ModuleRegistry();
    expect(registry.getById('non-existent')).toBeUndefined();
  });
});
