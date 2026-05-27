'use strict';

process.env.NODE_ENV = 'test';

const { RunnerService, getRunnerService } = require('../../src/services/runnerService');
const crypto = require('crypto');
const registryModule = require('../../src/modules/registry');

// Mock dependencies
jest.mock('../../src/db/database', () => {
  const mockCreate = jest.fn().mockResolvedValue({});
  const mockUpdate = jest.fn().mockResolvedValue([1]);
  const mockDestroy = jest.fn().mockResolvedValue(1);
  const mockFindAll = jest.fn().mockResolvedValue([]);
  const mockFindByPk = jest.fn().mockResolvedValue(null);
  const mockFindOne = jest.fn().mockResolvedValue(null);

  return {
    getDb: () => ({
      RemoteHost: {
        create: mockCreate,
        update: mockUpdate,
        destroy: mockDestroy,
        findAll: mockFindAll,
        findByPk: mockFindByPk
      },
      SlaveGroup: {
        findOne: mockFindOne,
        create: mockCreate
      },
      SlaveGroupMember: {
        findOne: mockFindOne,
        findAll: mockFindAll,
        create: mockCreate,
        destroy: mockDestroy
      }
    }),
    mockCreate,
    mockUpdate,
    mockDestroy,
    mockFindAll,
    mockFindByPk,
    mockFindOne
  };
});

jest.mock('../../src/auth/jwks', () => ({
  getJwksManager: jest.fn().mockReturnValue({
    signSlaveToken: jest.fn().mockReturnValue('mock-token')
  })
}));

jest.mock('../../src/services/cryptoService', () => {
  const mockEvict = jest.fn();
  const mockGetPublicKey = jest.fn();
  const mockEncrypt = jest.fn();
  const mockCache = jest.fn();

  return {
    getCryptoService: () => ({
      evictPublicKey: mockEvict,
      getPublicKey: mockGetPublicKey,
      encryptForSlave: mockEncrypt,
      cachePublicKey: mockCache
    }),
    mockEvict,
    mockGetPublicKey,
    mockEncrypt,
    mockCache
  };
});

jest.mock('../../src/modules/registry', () => ({
  getRegistry: jest.fn().mockReturnValue({
    unregisterDynamicByRunner: jest.fn(),
    registerDynamic: jest.fn()
  })
}));

describe('RunnerService Unit Tests', () => {
  let svc;
  let originalFetch;
  let dbMocks;
  let cryptoMocks;
  let registryMock;

  beforeEach(() => {
    svc = new RunnerService();
    originalFetch = global.fetch;
    global.fetch = jest.fn();
    
    dbMocks = require('../../src/db/database');
    cryptoMocks = require('../../src/services/cryptoService');
    registryMock = require('../../src/modules/registry').getRegistry();
    
    jest.clearAllMocks();
  });

  afterEach(() => {
    global.fetch = originalFetch;
    svc.stopPolling();
  });

  describe('Singleton', () => {
    it('returns the same instance', () => {
      const i1 = getRunnerService();
      const i2 = getRunnerService();
      expect(i1).toBe(i2);
      expect(i1).toBeInstanceOf(RunnerService);
    });
  });

  describe('CRUD operations', () => {
    it('getRunners() returns mapped rows', async () => {
      dbMocks.mockFindAll.mockResolvedValueOnce([
        { id: '1', name: 'R1', url: 'http', status: 'online', last_seen_at: null, modules_json: '[{"name":"m1"}]' }
      ]);
      const res = await svc.getRunners();
      expect(res).toHaveLength(1);
      expect(res[0].modules).toEqual([{ name: 'm1' }]);
    });

    it('getRunnerById() returns mapped row or null', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce(null);
      expect(await svc.getRunnerById('1')).toBeNull();

      dbMocks.mockFindByPk.mockResolvedValueOnce({
        id: '1', name: 'R1', modules_json: null
      });
      const res = await svc.getRunnerById('1');
      expect(res.name).toBe('R1');
      expect(res.modules).toEqual([]);
    });

    it('createRunner() creates and triggers poll', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: 'new-id', name: 'R' });
      jest.spyOn(svc, '_pollRunner').mockResolvedValue();

      svc._pollingStarted = true;
      const res = await svc.createRunner({ name: 'R', url: 'http', psk: '123' });
      
      expect(dbMocks.mockCreate).toHaveBeenCalled();
      expect(res.name).toBe('R');
      
      // wait a tick for setTimeout
      await new Promise(r => setTimeout(r, 10));
      expect(svc._pollRunner).toHaveBeenCalled();
    });

    it('updateRunner() updates and triggers poll', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', name: 'R2' });
      jest.spyOn(svc, '_pollRunner').mockResolvedValue();

      svc._pollingStarted = true;
      const res = await svc.updateRunner('1', { name: 'R2' });
      
      expect(dbMocks.mockUpdate).toHaveBeenCalled();
      expect(res.name).toBe('R2');
      
      await new Promise(r => setTimeout(r, 10));
      expect(svc._pollRunner).toHaveBeenCalledWith('1');
    });

    it('deleteRunner() destroys and evicts key', async () => {
      await svc.deleteRunner('1');
      expect(dbMocks.mockDestroy).toHaveBeenCalledWith({ where: { id: '1' } });
      expect(cryptoMocks.mockEvict).toHaveBeenCalledWith('1');
    });
  });

  describe('runModuleOnHost', () => {
    it('throws if runner not found', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce(null);
      await expect(svc.runModuleOnHost('1', 'm1')).rejects.toThrow('Runner not found');
    });

    it('encrypts args if public key exists', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      cryptoMocks.mockGetPublicKey.mockReturnValue('pubkey');
      cryptoMocks.mockEncrypt.mockReturnValue('encrypted-args');
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ status: 'ok' })
      });

      const res = await svc.runModuleOnHost('1', 'm1', ['arg1']);
      
      expect(cryptoMocks.mockEncrypt).toHaveBeenCalled();
      expect(global.fetch).toHaveBeenCalledWith('http/run', expect.objectContaining({
        body: JSON.stringify({ module: 'm1', encrypted_args: 'encrypted-args' })
      }));
      expect(res.status).toBe('ok');
    });

    it('sends plaintext args if encryption fails', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      cryptoMocks.mockGetPublicKey.mockReturnValue('pubkey');
      cryptoMocks.mockEncrypt.mockImplementation(() => { throw new Error('fail'); });
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify({ status: 'ok' })
      });

      await svc.runModuleOnHost('1', 'm1', ['arg1']);
      
      expect(global.fetch).toHaveBeenCalledWith('http/run', expect.objectContaining({
        body: JSON.stringify({ module: 'm1', args: ['arg1'] })
      }));
    });

    it('throws if fetch response is not ok', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      cryptoMocks.mockGetPublicKey.mockReturnValue(null);
      
      global.fetch.mockResolvedValueOnce({ ok: false, status: 500 });

      await expect(svc.runModuleOnHost('1', 'm1', [])).rejects.toThrow('Remote execution failed: Runner returned status: 500');
    });

    it('returns raw text if json parsing fails', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      cryptoMocks.mockGetPublicKey.mockReturnValue(null);
      
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/plain' },
        text: async () => 'bad-json'
      });

      const res = await svc.runModuleOnHost('1', 'm1', []);
      expect(res.error).toBe('Failed to parse JSON response from runner');
      expect(res.raw).toBe('bad-json');
    });
  });

  describe('Polling', () => {
    it('startPolling() sets timer and initial timeout', () => {
      jest.useFakeTimers();
      jest.spyOn(svc, '_pollAllRunners').mockImplementation();
      
      svc.startPolling();
      expect(svc._pollingStarted).toBe(true);
      
      jest.advanceTimersByTime(2500); // 2000 initial
      expect(svc._pollAllRunners).toHaveBeenCalledTimes(1);
      
      jest.useRealTimers();
    });

    it('stopPolling() clears timers', () => {
      svc._pollingStarted = true;
      svc.runnerTimers.set('1', setTimeout(() => {}, 1000));
      svc.stopPolling();
      expect(svc._pollingStarted).toBe(false);
      expect(svc.runnerTimers.size).toBe(0);
    });

    it('_pollAllRunners calls _schedulePoll for each runner', async () => {
      dbMocks.mockFindAll.mockResolvedValueOnce([{ id: '1' }, { id: '2' }]);
      jest.spyOn(svc, '_schedulePoll').mockImplementation();
      svc._pollingStarted = true;
      
      await svc._pollAllRunners();
      
      expect(svc._schedulePoll).toHaveBeenCalledWith('1', 0);
      expect(svc._schedulePoll).toHaveBeenCalledWith('2', 0);
    });

    it('_pollRunner marks online, fetches pubkey, and syncs modules', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      
      // Mock fetch for /modules and /pubkey
      global.fetch
        .mockResolvedValueOnce({ ok: true, json: async () => ([{ id: 'm1', name: 'Module 1' }]) }) // /modules
        .mockResolvedValueOnce({ ok: true, text: async () => 'pem-key' }); // /pubkey

      await svc._pollRunner('1');

      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect(cryptoMocks.mockCache).toHaveBeenCalledWith('1', 'pem-key');
      expect(dbMocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'online' }),
        { where: { id: '1' } }
      );
      
      expect(registryMock.unregisterDynamicByRunner).toHaveBeenCalledWith('1');
      expect(registryMock.registerDynamic).toHaveBeenCalled();
    });

    it('_pollRunner marks offline if fetch fails', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      
      global.fetch.mockRejectedValueOnce(new Error('offline')); // /modules

      await svc._pollRunner('1');

      expect(global.fetch).toHaveBeenCalledTimes(1); // /pubkey skipped
      expect(dbMocks.mockUpdate).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'offline' }),
        { where: { id: '1' } }
      );
    });

    it('_pollRunner handles invalid module json parsing safely', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => 'not-an-array' });
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Ensure JSON parse fails by making JSON.parse throw in the service (since the service passes string to JSON.parse)
      const mockJson = { bad: 'data' };
      global.fetch.mockReset();
      global.fetch.mockResolvedValueOnce({ ok: true, json: async () => (mockJson) });
      
      await svc._pollRunner('1');
      expect(dbMocks.mockUpdate).toHaveBeenCalled();
      consoleSpy.mockRestore();
    });
  });

  describe('getAuthHeaders', () => {
    it('returns empty Auth header if signing fails', () => {
      const jwks = require('../../src/auth/jwks').getJwksManager();
      jwks.signSlaveToken.mockImplementationOnce(() => { throw new Error('fail'); });
      
      const headers = svc._getAuthHeaders({ id: '1' });
      expect(headers['Authorization']).toBeUndefined();
    });
  });
});
