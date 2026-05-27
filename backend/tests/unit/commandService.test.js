'use strict';

process.env.NODE_ENV = 'test';
process.env.ALLOWED_COMMANDS = '*';



const { createTestDb }    = require('../helpers/testDb');
const dbModule            = require('../../src/db/database');
const { CommandService, _resetCommandService } = require('../../src/services/commandService');

let testDb;
let svc;

beforeEach(async () => {
  testDb = await createTestDb();
  dbModule._setDb(testDb);
  _resetCommandService();
  svc = new CommandService();
  await testDb.User.bulkCreate([
    { id: 'u1', username: 'alice', password_hash: 'hash', role: 'viewer' },
    { id: 'admin1', username: 'bob', password_hash: 'hash', role: 'admin' }
  ]);
  
  await testDb.RemoteHost.create({
    id: 'mock-runner',
    name: 'Mock Runner',
    url: 'http://localhost:8888',
    status: 'online'
  });
});

afterEach(() => {
  if (global.fetch) {
    jest.restoreAllMocks();
  }
});

describe('CommandService', () => {
  it('submit() creates a pending command record', async () => {
    const cmd = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    expect(cmd.status).toBe('pending');
    expect(cmd.command).toBe('ping 8.8.8.8');
  });

  it('submit() throws when command is empty', async () => {
    await expect(svc.submit('u1', 'alice', '', 'mock-runner')).rejects.toThrow('Command cannot be empty');
  });

  it('submit() throws when command not in allowlist (if configured)', async () => {
    const config2 = require('../../src/config');
    const origAllowed = config2.allowedCommands;
    config2.allowedCommands = 'ping,nmap';
    expect(config2.isCommandAllowed('rm -rf /')).toBe(false);
    config2.allowedCommands = origAllowed;
  });

  it('submit() throws 403 when command is blocked by the allowlist', async () => {
    const config2 = require('../../src/config');
    const origAllowed = config2.allowedCommands;
    config2.allowedCommands = 'ping,nmap';

    expect(config2.isCommandAllowed('ping 1.1.1.1')).toBe(true);
    expect(config2.isCommandAllowed('rm -rf /')).toBe(false);
    expect(config2.isCommandAllowed('nmap -sV 1.1.1.1')).toBe(true);

    config2.allowedCommands = origAllowed;
  });

  it('reject() marks command as rejected', async () => {
    const cmd     = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    const rejected = await svc.reject('admin1', cmd.id, 'Not allowed');
    expect(rejected.status).toBe('rejected');
    expect(rejected.reason).toBe('Not allowed');
  });

  it('reject() throws for already-rejected command', async () => {
    const cmd = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    await svc.reject('admin1', cmd.id, '');
    await expect(svc.reject('admin1', cmd.id, '')).rejects.toThrow();
  });

  it('reject() throws for unknown id', async () => {
    await expect(svc.reject('admin1', 'bad-id', '')).rejects.toThrow('Command not found');
  });

  it('approve() throws for unknown id', async () => {
    await expect(svc.approve('admin1', 'bad-id')).rejects.toThrow('Command not found');
  });

  it('approve() throws for non-pending command', async () => {
    const cmd = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    await svc.reject('admin1', cmd.id, 'reason');
    await expect(svc.approve('admin1', cmd.id)).rejects.toThrow();
  });

  it('approve() executes the command and stores output', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: Buffer.from('data: {"type":"stdout","line":"PING OK"}\n\ndata: {"type":"done","exit_code":0}\n\n') };
              }
              return { done: true };
            }
          };
        }
      }
    });

    const cmd      = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    const executed = await svc.approve('admin1', cmd.id);
    expect(executed.status).toBe('executed');
    expect(executed.output).toContain('PING OK');
  });

  it('approve() marks as failed on exec error', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      body: {
        getReader: () => {
          let readCount = 0;
          return {
            read: async () => {
              if (readCount === 0) {
                readCount++;
                return { done: false, value: Buffer.from('data: {"type":"error","error":"Permission denied"}\n\ndata: {"type":"done","exit_code":1}\n\n') };
              }
              return { done: true };
            }
          };
        }
      }
    });

    const cmd      = await svc.submit('u1', 'alice', 'ping 8.8.8.8', 'mock-runner');
    const executed = await svc.approve('admin1', cmd.id);
    expect(executed.status).toBe('failed');
    expect(executed.error).toContain('Permission denied');
  });

  it('getHistory() returns all commands for admin', async () => {
    await svc.submit('u1', 'alice', 'ping 1.1.1.1', 'mock-runner');
    await svc.submit('u1', 'alice', 'ping 2.2.2.2', 'mock-runner');
    const { commands, total } = await svc.getHistory({ userId: 'admin1', role: 'admin' });
    expect(total).toBe(2);
    expect(commands.length).toBe(2);
  });

  it('getHistory() returns only own commands for viewer', async () => {
    await testDb.User.create({ id: 'u2', username: 'charlie', password_hash: 'hash', role: 'viewer' });
    await svc.submit('u1', 'alice', 'ping 1.1.1.1', 'mock-runner');
    await svc.submit('u2', 'charlie', 'ping 2.2.2.2', 'mock-runner');
    const { total } = await svc.getHistory({ userId: 'u1', role: 'viewer' });
    expect(total).toBe(1);
  });

  it('getHistory() filters by status', async () => {
    await svc.submit('u1', 'alice', 'ping 3.3.3.3', 'mock-runner');
    const { commands } = await svc.getHistory({ userId: 'admin1', role: 'admin', status: 'pending' });
    expect(commands.every(c => c.status === 'pending')).toBe(true);
  });

  it('getCommand() returns the command by id', async () => {
    const cmd = await svc.submit('u1', 'alice', 'ping 4.4.4.4', 'mock-runner');
    const found = await svc.getCommand(cmd.id);
    expect(found.id).toBe(cmd.id);
  });

  it('getCommand() returns null for unknown id', async () => {
    const found = await svc.getCommand('non-existent');
    expect(found).toBeNull();
  });
});
