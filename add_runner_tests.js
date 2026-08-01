const fs = require('fs');

const path = './backend/tests/unit/runnerService.test.js';
let content = fs.readFileSync(path, 'utf8');

content = content.replace("jest.mock('../../src/modules/registry'", "jest.mock('../../src/services/executionQueueService', () => ({\n  getExecutionQueueService: jest.fn().mockReturnValue({ migrateTasksFromRunner: jest.fn() })\n}));\n\njest.mock('../../src/modules/registry'");

content = content.replace(
  "        findByPk: mockFindByPk\n      },",
  "        findByPk: mockFindByPk,\n        findOne: mockFindOne\n      },"
);

const tests = `
  describe('Additional coverage', () => {
    it('getBestRunnerInGroup - no group', async () => {
      dbMocks.mockFindOne.mockResolvedValueOnce(null);
      const { RemoteHost } = dbMocks.getDb();
      RemoteHost.findOne = jest.fn().mockResolvedValueOnce({ id: 'pref' });
      expect(await svc.getBestRunnerInGroup('pref')).toBe('pref');
    });

    it('getBestRunnerInGroup - with peers', async () => {
      dbMocks.mockFindOne.mockResolvedValueOnce({ group_id: 'g1' });
      dbMocks.mockFindAll.mockResolvedValueOnce([
        { runner: { id: 'r1' } },
        { runner: { id: 'r2' } }
      ]);
      svc.runnerActiveTasks.set('r1', 5);
      svc.runnerActiveTasks.set('r2', 2);
      expect(await svc.getBestRunnerInGroup('pref')).toBe('r2');
    });

    it('runBulkOnHost - 404 unsupported', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      global.fetch.mockResolvedValueOnce({ status: 404 });
      await expect(svc.runBulkOnHost('1', 'm1', ['t1'])).rejects.toThrow('Endpoint /run-bulk not supported');
      expect(svc.runnerSupportsBulk('1')).toBe(false);
    });

    it('runBulkOnHost - SSE processing', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      const mockStream = {
        getReader: () => {
          let reads = 0;
          return {
            read: async () => {
              reads++;
              if (reads === 1) return { done: false, value: new TextEncoder().encode('data: {"target":"t1","type":"stdout","line":"hello"}\\n\\ndata: {"target":"t1","type":"done","exit_code":0}\\n') };
              return { done: true };
            }
          };
        }
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/event-stream' },
        body: mockStream
      });
      const res = await svc.runBulkOnHost('1', 'm1', ['t1']);
      expect(res).toHaveLength(1);
      expect(res[0].stdout).toContain('hello');
    });

    it('runBulkOnHost - fallback JSON', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'application/json' },
        text: async () => JSON.stringify([{ target: 't1', stdout: 'json_out' }])
      });
      const res = await svc.runBulkOnHost('1', 'm1', ['t1']);
      expect(res[0].stdout).toBe('json_out');
    });

    it('_migrateQueuedTasks', async () => {
      dbMocks.mockFindOne.mockResolvedValueOnce({ group_id: 'g1' });
      dbMocks.mockFindAll.mockResolvedValueOnce([
        { runner: { id: 'peer1', status: 'online' } }
      ]);
      const queueSvcMock = require('../../src/services/executionQueueService').getExecutionQueueService();
      await svc._migrateQueuedTasks('offline1');
      expect(queueSvcMock.migrateTasksFromRunner).toHaveBeenCalledWith('offline1', 'peer1');
    });

    it('_fetchWithRetry - success after retry', async () => {
      global.fetch.mockResolvedValueOnce({ status: 429 }).mockResolvedValueOnce({ ok: true, status: 200 });
      const res = await svc._fetchWithRetry('url', {});
      expect(res.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
    
    it('runModuleOnHost - SSE processing', async () => {
      dbMocks.mockFindByPk.mockResolvedValueOnce({ id: '1', url: 'http' });
      const mockStream = {
        getReader: () => {
          let reads = 0;
          return {
            read: async () => {
              reads++;
              if (reads === 1) return { done: false, value: new TextEncoder().encode('data: {"type":"stdout","line":"hi"}\\n\\ndata: {"type":"done","exit_code":0}\\n') };
              return { done: true };
            }
          };
        }
      };
      global.fetch.mockResolvedValueOnce({
        ok: true,
        headers: { get: () => 'text/event-stream' },
        body: mockStream
      });
      const res = await svc.runModuleOnHost('1', 'm1', []);
      expect(res.stdout).toContain('hi');
    });
  });
});
`;

content = content.replace(/}\);\s*$/, tests);

fs.writeFileSync(path, content);
console.log('runnerService.test.js updated');
