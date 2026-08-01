const { getRunnerService } = require('../../src/services/runnerService');
const { getExecutionQueueService } = require('../../src/services/executionQueueService');
const { getDb } = require('../../src/db/database');

jest.mock('../../src/services/executionQueueService', () => ({
  getExecutionQueueService: jest.fn().mockReturnValue({
    requeueByRunnerId: jest.fn(),
    migrateTasksFromRunner: jest.fn()
  })
}));

jest.mock('../../src/db/database', () => ({
  getDb: jest.fn()
}));

const fs = require('fs');
jest.mock('fs');

global.fetch = jest.fn();

describe('runnerService extra tests', () => {
  let runnerService;
  
  beforeEach(() => {
    runnerService = getRunnerService();
    jest.clearAllMocks();
  });

  it('_migrateQueuedTasks skips if no member', async () => {
    const SlaveGroupMember = { findOne: jest.fn().mockResolvedValue(null) };
    getDb.mockReturnValue({ SlaveGroupMember });
    await runnerService._migrateQueuedTasks('offline-id');
    expect(SlaveGroupMember.findOne).toHaveBeenCalledWith({ where: { runner_id: 'offline-id' } });
  });

  it('_migrateQueuedTasks skips if no peers', async () => {
    const SlaveGroupMember = { 
      findOne: jest.fn().mockResolvedValue({ group_id: 1 }),
      findAll: jest.fn().mockResolvedValue([])
    };
    getDb.mockReturnValue({ SlaveGroupMember, RemoteHost: {} });
    await runnerService._migrateQueuedTasks('offline-id');
  });

  it('_migrateQueuedTasks migrates to peer', async () => {
    const SlaveGroupMember = { 
      findOne: jest.fn().mockResolvedValue({ group_id: 1 }),
      findAll: jest.fn().mockResolvedValue([
        { runner: { id: 'online-id' } }
      ])
    };
    getDb.mockReturnValue({ SlaveGroupMember, RemoteHost: {} });
    await runnerService._migrateQueuedTasks('offline-id');
    expect(getExecutionQueueService().migrateTasksFromRunner).toHaveBeenCalledWith('offline-id', 'online-id');
  });

  it('_downloadSandboxFiles returns empty array on error', async () => {
    fs.existsSync.mockReturnValue(true);
    global.fetch.mockRejectedValue(new Error('Network error'));
    const runner = { id: 'runner-1', url: 'http://test' };
    const files = [{ name: 'file1.txt' }];
    const downloaded = await runnerService._downloadFiles(runner, 'sandbox-1', files);
    expect(downloaded).toEqual([]);
  });

  it('_downloadSandboxFiles downloads successfully', async () => {
    fs.existsSync.mockReturnValue(false);
    fs.mkdirSync.mockImplementation(() => {});
    fs.writeFileSync.mockImplementation(() => {});
    global.fetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8)
    });
    
    const runner = { id: 'runner-1', url: 'http://test', auth_token: 'tok' };
    const files = [{ name: 'file1.txt' }];
    const downloaded = await runnerService._downloadFiles(runner, 'sandbox-1', files);
    expect(downloaded.length).toBe(1);
    expect(fs.writeFileSync).toHaveBeenCalled();
  });
});
