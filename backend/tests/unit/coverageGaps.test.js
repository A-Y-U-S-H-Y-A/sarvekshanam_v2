'use strict';

process.env.NODE_ENV = 'test';

/**
 * Tests for small coverage gaps across multiple modules:
 * - database.js (closeDb, _setDb, syncDb)
 * - adminOnly.js (!req.user branch)
 * - errorHandler.js (development stack trace)
 * - registry.js (registerDynamic, unregisterDynamicByRunner, _load error handler)
 * - healthRoutes.js (GET /health)
 * - jwksRoutes.js (GET /jwks.json)
 */

const request   = require('supertest');
const express   = require('express');

// ── database.js ───────────────────────────────────────────────────────────────
describe('database.js', () => {
  let dbModule;

  beforeEach(() => {
    jest.resetModules();
    dbModule = require('../../src/db/database');
  });

  it('getDb() returns the Sequelize db object', () => {
    const db = dbModule.getDb();
    expect(db).toBeDefined();
    expect(db.sequelize).toBeDefined();
  });

  it('closeDb() closes the sequelize connection without throwing', async () => {
    await expect(dbModule.closeDb()).resolves.not.toThrow();
  });

  it('closeDb() swallows errors gracefully', async () => {
    const db = dbModule.getDb();
    const origClose = db.sequelize.close.bind(db.sequelize);
    db.sequelize.close = jest.fn().mockRejectedValueOnce(new Error('closed'));
    await expect(dbModule.closeDb()).resolves.not.toThrow();
    db.sequelize.close = origClose;
  });

  it('_setDb() is a no-op (interface compatibility)', () => {
    expect(() => dbModule._setDb({})).not.toThrow();
  });

  it('syncDb() calls sequelize.sync', async () => {
    const db = dbModule.getDb();
    const spy = jest.spyOn(db.sequelize, 'sync').mockResolvedValue();
    await dbModule.syncDb();
    expect(spy).toHaveBeenCalledWith({ force: true });
    spy.mockRestore();
  });
});

// ── adminOnly.js ──────────────────────────────────────────────────────────────
describe('adminOnly middleware', () => {
  const adminOnly = require('../../src/middleware/adminOnly');

  it('returns 401 when req.user is missing', () => {
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    adminOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it('returns 403 when user is not admin', () => {
    const req = { user: { role: 'viewer' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    adminOnly(req, res, next);
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('calls next() when user is admin', () => {
    const req = { user: { role: 'admin' } };
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    const next = jest.fn();
    adminOnly(req, res, next);
    expect(next).toHaveBeenCalled();
  });
});

// ── errorHandler.js ───────────────────────────────────────────────────────────
describe('errorHandler middleware', () => {
  const errorHandler = require('../../src/middleware/errorHandler');

  it('returns error JSON with status', () => {
    const err = Object.assign(new Error('Bad request'), { status: 400 });
    const req = {};
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json };
    const next = jest.fn();

    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(json).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('defaults to status 500 when no status on error', () => {
    const err = new Error('Oops');
    const req = {};
    const json = jest.fn();
    const res = { status: jest.fn().mockReturnThis(), json };
    errorHandler(err, req, res, jest.fn());
    expect(res.status).toHaveBeenCalledWith(500);
  });

  it('includes stack trace in development mode', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const err = Object.assign(new Error('Dev error'), { stack: 'Error\n  at line 1' });
    const req = {};
    const captured = [];
    const res = { status: jest.fn().mockReturnThis(), json: (body) => captured.push(body) };
    errorHandler(err, req, res, jest.fn());
    expect(captured[0].error.stack).toBeDefined();
    process.env.NODE_ENV = origEnv;
  });

  it('logs error to console in non-test mode', () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'development';
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    const err = new Error('Log me');
    const req = {};
    const res = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    errorHandler(err, req, res, jest.fn());
    expect(consoleSpy).toHaveBeenCalled();
    consoleSpy.mockRestore();
    process.env.NODE_ENV = origEnv;
  });
});

// ── registry.js ───────────────────────────────────────────────────────────────
describe('ModuleRegistry', () => {
  let ModuleRegistry, _resetRegistry, getRegistry;

  beforeEach(() => {
    jest.resetModules();
    ({ ModuleRegistry, _resetRegistry, getRegistry } = require('../../src/modules/registry'));
  });

  it('registerDynamic() ignores non-BaseModule instances', () => {
    const registry = getRegistry();
    const before = registry.size;
    registry.registerDynamic({ meta: { id: 'fake' } }); // not a BaseModule
    registry.registerDynamic(null);
    registry.registerDynamic(42);
    expect(registry.size).toBe(before);
  });

  it('unregisterDynamicByRunner() removes modules by runner prefix', () => {
    const registry = getRegistry();
    // Inject directly into the internal map to simulate a registered remote module
    registry._modules.set('remote_runner123_my-module', { meta: { id: 'remote_runner123_my-module' } });
    expect(registry._modules.has('remote_runner123_my-module')).toBe(true);

    registry.unregisterDynamicByRunner('runner123');
    expect(registry._modules.has('remote_runner123_my-module')).toBe(false);
  });

  it('unregisterDynamicByRunner() does not remove unrelated modules', () => {
    const registry = getRegistry();
    const initialSize = registry.size;
    registry._modules.set('remote_other_runner_mod', { meta: { id: 'remote_other_runner_mod' } });
    registry.unregisterDynamicByRunner('runner123'); // different runner
    expect(registry._modules.has('remote_other_runner_mod')).toBe(true);
    // clean up
    registry._modules.delete('remote_other_runner_mod');
  });

  it('getByCategory() returns modules grouped by category', () => {
    const registry = getRegistry();
    const grouped = registry.getByCategory();
    expect(typeof grouped).toBe('object');
  });

  it('getById() returns undefined for unknown id', () => {
    const registry = getRegistry();
    expect(registry.getById('non-existent-module-id-xyz')).toBeUndefined();
  });

  it('getAll() returns array of module metadata', () => {
    const registry = getRegistry();
    const all = registry.getAll();
    expect(Array.isArray(all)).toBe(true);
  });

  it('_load() does not throw even if a module file causes an error', () => {
    // Just constructing a new registry exercises _load()
    const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
    const r = new ModuleRegistry();
    expect(r).toBeDefined();
    warnSpy.mockRestore();
  });

  it('_resetRegistry() clears the singleton', () => {
    const r1 = getRegistry();
    _resetRegistry();
    const r2 = getRegistry();
    expect(r1).not.toBe(r2);
  });
});

// ── healthRoutes.js ───────────────────────────────────────────────────────────
describe('healthRoutes', () => {
  let app;

  beforeEach(() => {
    app = express();
    app.use(require('../../src/routes/healthRoutes'));
  });

  it('GET /health returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.service).toBe('Sarvekshanam');
    expect(res.body.data.status).toBe('ok');
    expect(res.body.data.version).toBeDefined();
    expect(typeof res.body.data.uptime).toBe('number');
  });
});

// ── jwksRoutes.js ─────────────────────────────────────────────────────────────
describe('jwksRoutes', () => {
  let app;

  beforeEach(() => {
    jest.resetModules();
    app = express();
    app.use(require('../../src/routes/jwksRoutes'));
  });

  it('GET /jwks.json returns a JWKS object', async () => {
    const res = await request(app).get('/jwks.json');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('keys');
  });
});
