'use strict';

const { QUICK_SCAN_OUTPUT, PORT_SCAN_OUTPUT, NMAP_NOT_FOUND_ERROR } = require('../helpers/mockNmap');

// Mock child_process.exec before requiring modules
jest.mock('child_process', () => ({ exec: jest.fn() }));
const { exec } = require('child_process');

const NmapQuickScan = require('../../src/modules/nmap/nmapQuickScan');
const NmapPortScan  = require('../../src/modules/nmap/nmapPortScan');

// ── NmapQuickScan ─────────────────────────────────────────────────────────────
describe('NmapQuickScan', () => {
  let mod;
  beforeEach(() => { mod = new NmapQuickScan(); exec.mockReset(); });

  it('has correct meta', () => {
    expect(mod.meta.id).toBe('nmap-quick-scan');
    expect(mod.meta.category).toBe('Network');
    expect(mod.meta.parameters.some(p => p.name === 'target')).toBe(true);
  });

  it('validate() returns error when target is missing', () => {
    const errors = mod.validate({});
    expect(errors).toContain('Parameter "target" is required');
  });

  it('validate() returns empty array when target is present', () => {
    expect(mod.validate({ target: '192.168.1.1' })).toHaveLength(0);
  });

  it('run() returns mock result in mockMode', async () => {
    const result = await mod.run({ target: '192.168.1.1' }, { mockMode: true });
    expect(result.status).toBe('success');
    expect(result.raw.mock).toBe(true);
    expect(Array.isArray(result.raw.hosts)).toBe(true);
  });

  it('run() parses real nmap output', async () => {
    exec.mockImplementation((cmd, opts, cb) => cb(null, QUICK_SCAN_OUTPUT, ''));
    const result = await mod.run({ target: '192.168.1.0/24' });
    expect(result.status).toBe('success');
    expect(result.raw.hosts.length).toBeGreaterThanOrEqual(1);
  });

  it('run() falls back to mock when nmap is not found', async () => {
    exec.mockImplementation((cmd, opts, cb) => cb(NMAP_NOT_FOUND_ERROR, '', ''));
    const result = await mod.run({ target: '192.168.1.1' });
    expect(result.status).toBe('success');
    expect(result.raw.mock).toBe(true);
  });

  it('run() returns error status on real exec error', async () => {
    const err = new Error('Permission denied');
    exec.mockImplementation((cmd, opts, cb) => cb(err, '', 'Permission denied'));
    const result = await mod.run({ target: '192.168.1.1' });
    expect(result.status).toBe('error');
  });

  it('run() returns error when params invalid', async () => {
    const result = await mod.run({});
    expect(result.status).toBe('error');
  });
});

// ── NmapPortScan ──────────────────────────────────────────────────────────────
describe('NmapPortScan', () => {
  let mod;
  beforeEach(() => { mod = new NmapPortScan(); exec.mockReset(); });

  it('has correct meta', () => {
    expect(mod.meta.id).toBe('nmap-port-scan');
    expect(mod.meta.category).toBe('Network');
    const portParam = mod.meta.parameters.find(p => p.name === 'ports');
    expect(portParam).toBeDefined();
    expect(portParam.default).toBe('1-1000');
  });

  it('run() returns mock result in mockMode', async () => {
    const result = await mod.run({ target: '192.168.1.1' }, { mockMode: true });
    expect(result.status).toBe('success');
    expect(result.raw.mock).toBe(true);
    expect(result.raw.openCount).toBe(5);
  });

  it('run() parses real nmap port scan output', async () => {
    exec.mockImplementation((cmd, opts, cb) => cb(null, PORT_SCAN_OUTPUT, ''));
    const result = await mod.run({ target: '192.168.1.1', ports: '1-1000' });
    expect(result.status).toBe('success');
    expect(result.raw.openCount).toBeGreaterThan(0);
  });

  it('run() falls back to mock when nmap not found', async () => {
    exec.mockImplementation((cmd, opts, cb) => cb(NMAP_NOT_FOUND_ERROR, '', ''));
    const result = await mod.run({ target: '192.168.1.1' });
    expect(result.raw.mock).toBe(true);
  });

  it('run() uses default ports and timing when not specified', async () => {
    exec.mockImplementation((cmd, opts, cb) => {
      expect(cmd).toContain('-p 1-1000');
      expect(cmd).toContain('-T3');
      cb(null, PORT_SCAN_OUTPUT, '');
    });
    await mod.run({ target: '10.0.0.1' });
  });
});
