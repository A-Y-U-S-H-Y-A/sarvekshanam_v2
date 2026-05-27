'use strict';

// Set test DB before any module is required
process.env.NODE_ENV = 'test';

const { createTestDb }               = require('../helpers/testDb');
const dbModule                       = require('../../src/db/database');
const { getScanSessionService, _resetScanSessionService } = require('../../src/services/scanSessionService');

const mockRegistry = {
  getById: jest.fn((id) => id === 'nmap-quick-scan' ? {
    meta: { id: 'nmap-quick-scan' },
    run:  async () => ({ status: 'success', output: 'Mock output', raw: { hosts: [] }, timestamp: new Date().toISOString() }),
  } : undefined),
};

// Mock the module registry so we don't need real modules in this unit test
jest.mock('../../src/modules/registry', () => ({
  getRegistry: () => mockRegistry,
}));

// Mock vector service to avoid real RAG operations
jest.mock('../../src/services/vectorService', () => ({
  getVectorService: () => ({
    ingest: jest.fn().mockResolvedValue({ docId: 'test', chunksIngested: 1 }),
  }),
}));

let testDb;
let svc;

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetScanSessionService();
  svc = getScanSessionService();

  // Seed a user
  await testDb.User.create({ id: 'u1', username: 'alice', password_hash: 'hash', role: 'viewer' });
});

describe('ScanSessionService', () => {
  it('create() returns a valid session', async () => {
    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'] });
    expect(session.id).toBeDefined();
    expect(session.status).toBe('pending');
    expect(session.targets).toEqual(['192.168.1.1']);
  });

  it('create() sets a default name when name is omitted', async () => {
    const session = await svc.create('u1', { targets: ['10.0.0.1'], moduleIds: ['nmap-quick-scan'] });
    expect(session.name).toBeDefined();
    expect(session.name.length).toBeGreaterThan(0);
  });

  it('get() retrieves the session from cache then DB', async () => {
    const s1 = await svc.create('u1', { targets: ['10.0.0.1'], moduleIds: ['nmap-quick-scan'] });
    // Simulate cache miss
    svc._cache.clear();
    const s2 = await svc.get(s1.id);
    expect(s2).not.toBeNull();
    expect(s2.id).toBe(s1.id);
  });

  it('get() returns null for unknown id', async () => {
    expect(await svc.get('non-existent')).toBeNull();
  });

  it('get() uses cache on second call', async () => {
    const s1 = await svc.create('u1', { targets: ['10.0.0.1'], moduleIds: ['nmap-quick-scan'] });
    // First get populates cache
    await svc.get(s1.id);
    // Second get should use cache (no DB hit needed)
    const s2 = await svc.get(s1.id);
    expect(s2.id).toBe(s1.id);
  });

  it('update() changes status and emits event', async () => {
    const session = await svc.create('u1', { targets: ['10.0.0.1'], moduleIds: ['nmap-quick-scan'] });
    const events  = [];
    svc.on('session:update', e => events.push(e));

    await svc.update(session.id, { status: 'running' });
    expect(events).toHaveLength(1);
    expect(events[0].status).toBe('running');
  });

  it('update() returns null for non-existent session', async () => {
    const result = await svc.update('non-existent', { status: 'running' });
    expect(result).toBeNull();
  });

  it('list() returns paginated sessions for a user', async () => {
    await svc.create('u1', { targets: ['t1'], moduleIds: ['nmap-quick-scan'] });
    await svc.create('u1', { targets: ['t2'], moduleIds: ['nmap-quick-scan'] });
    const { sessions, total } = await svc.list('u1');
    expect(sessions.length).toBe(2);
    expect(total).toBe(2);
  });

  it('list() filters by status', async () => {
    await svc.create('u1', { targets: ['t1'], moduleIds: ['nmap-quick-scan'] });
    const { sessions } = await svc.list('u1', { status: 'pending' });
    expect(sessions.every(s => s.status === 'pending')).toBe(true);
  });

  it('delete() removes a session', async () => {
    const s = await svc.create('u1', { targets: ['t1'], moduleIds: ['nmap-quick-scan'] });
    await svc.delete(s.id);
    expect(await svc.get(s.id)).toBeNull();
  });

  it('bulkCreate() creates one session per target', async () => {
    const sessions = await svc.bulkCreate('u1', { targets: ['t1', 't2', 't3'], moduleIds: ['nmap-quick-scan'] });
    expect(sessions).toHaveLength(3);
    sessions.forEach(s => expect(s.mode).toBe('bulk'));
  });

  it('bulkCreate() uses provided name with index', async () => {
    const sessions = await svc.bulkCreate('u1', { name: 'Batch', targets: ['t1', 't2'], moduleIds: ['nmap-quick-scan'] });
    expect(sessions[0].name).toContain('Batch [1/2]');
    expect(sessions[1].name).toContain('Batch [2/2]');
  });

  it('run() executes module and updates session to completed', async () => {
    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'] });
    const result  = await svc.run(session.id, { mockMode: true, syncExec: true });
    expect(result.status).toBe('completed');
    expect(result.results).toBeDefined();
  });

  it('run() handles unknown module gracefully (sets error in results)', async () => {
    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['unknown-module'] });
    const result  = await svc.run(session.id, { syncExec: true });
    expect(result.status).toBe('completed');
    expect(result.results['192.168.1.1']['unknown-module'].status).toBe('error');
  });

  it('run() handles module execution error (via mock override)', async () => {
    mockRegistry.getById.mockImplementationOnce((id) => ({
      meta: { id },
      run: async () => { throw new Error('Module crashed'); }
    }));

    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'] });
    const result  = await svc.run(session.id, { syncExec: true });
    // Should still complete and record error in results
    expect(result.results['192.168.1.1']['nmap-quick-scan'].status).toBe('error');
  });

  it('run() throws when session does not exist', async () => {
    await expect(svc.run('non-existent')).rejects.toThrow('Session non-existent not found');
  });

  it('run() handles RAG ingest error silently (fire-and-forget)', async () => {
    const { getVectorService } = require('../../src/services/vectorService');
    const mockSvc = getVectorService();
    // Make ingest reject on next call
    mockSvc.ingest.mockRejectedValueOnce(new Error('RAG fail'));

    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'] });
    // Should not throw even if RAG ingest fails
    await expect(svc.run(session.id, { syncExec: true })).resolves.toBeDefined();
    // small delay to let fire-and-forget settle
    await new Promise(r => setTimeout(r, 50));
  });

  it('run() handles synchronous RAG ingest trigger errors (JSON.stringify fail)', async () => {
    const session = await svc.create('u1', { targets: ['192.168.1.1'], moduleIds: ['nmap-quick-scan'] });
    
    const origStringify = JSON.stringify;
    JSON.stringify = (obj, replacer, space) => {
      if (space === 2) throw new Error('Stringify failed');
      return origStringify(obj, replacer, space);
    };
    
    try {
      // Should not throw
      await expect(svc.run(session.id, { syncExec: true })).resolves.toBeDefined();
    } finally {
      JSON.stringify = origStringify;
    }
  });

  it('create() with appointmentId links the session', async () => {
    const appt = await testDb.Appointment.create({
      id: 'appt-1',
      user_id: 'u1',
      name: 'Test Appt',
      status: 'active'
    });
    const session = await svc.create('u1', {
      targets: ['10.0.0.1'],
      moduleIds: ['nmap-quick-scan'],
      appointmentId: appt.id
    });
    expect(session.id).toBeDefined();
  });
});
