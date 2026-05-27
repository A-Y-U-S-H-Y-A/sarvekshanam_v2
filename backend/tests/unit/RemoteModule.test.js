'use strict';

process.env.NODE_ENV = 'test';

const RemoteModule = require('../../src/modules/base/RemoteModule');
const BaseModule = require('../../src/modules/base/BaseModule');

// Mock runnerService
const mockRunnerService = {
  runModuleOnHost: jest.fn()
};
jest.mock('../../src/services/runnerService', () => ({
  getRunnerService: () => mockRunnerService
}));

describe('RemoteModule Unit Tests', () => {
  const mockRunner = { id: 'runner-1', name: 'Edge Runner' };
  const mockModuleData = { 
    id: 'test-mod', 
    name: 'Test Module',
    description: 'A test remote module',
    parameters: [
      { name: 'param1', type: 'string', required: true }
    ]
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Metadata', () => {
    it('creates a module with correctly prefixed meta properties', () => {
      const mod = new RemoteModule(mockRunner, mockModuleData);
      expect(mod).toBeInstanceOf(BaseModule);
      expect(mod.meta.id).toBe('remote_runner-1_test-mod');
      expect(mod.meta.name).toBe('[Edge Runner] Test Module');
      expect(mod.meta.description).toBe('A test remote module');
      expect(mod.meta.category).toBe('Remote / Edge Runner');
    });

    it('sanitizes module ID', () => {
      const mod = new RemoteModule(mockRunner, { id: 'test@mod!', name: 'Test' });
      expect(mod.meta.id).toBe('remote_runner-1_test_mod_');
    });

    it('injects target parameter if missing', () => {
      const mod = new RemoteModule(mockRunner, { id: 'm1', name: 'M1', parameters: [] });
      expect(mod.meta.parameters).toHaveLength(1);
      expect(mod.meta.parameters[0].name).toBe('target');
    });

    it('does not inject target parameter if already present', () => {
      const mod = new RemoteModule(mockRunner, { 
        id: 'm1', name: 'M1', 
        parameters: [{ name: 'target', type: 'string' }]
      });
      expect(mod.meta.parameters).toHaveLength(1);
      expect(mod.meta.parameters[0].name).toBe('target');
    });

    it('falls back to default description if missing', () => {
      const mod = new RemoteModule(mockRunner, { id: 'm1', name: 'M1' });
      expect(mod.meta.description).toBe('Remote module executed on Edge Runner');
    });
  });

  describe('run()', () => {
    it('calls runnerService.runModuleOnHost with correct arguments', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ stdout: 'success' });
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      await mod.run({ target: '127.0.0.1', param1: 'val' });
      expect(mockRunnerService.runModuleOnHost).toHaveBeenCalledWith('runner-1', 'test-mod', ['127.0.0.1', 'val'], undefined);
    });

    it('handles remote returning an explicit error object', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ status: 'error', error: 'Failed remotely' });
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      const res = await mod.run({ target: '127.0.0.1' });
      expect(res.status).toBe('error');
      expect(res.output).toBe('Failed remotely');
    });

    it('parses JSON stdout if possible', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ 
        stdout: JSON.stringify({ result: 'ok', data: 123 }) 
      });
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      const res = await mod.run({ target: '127.0.0.1' });
      expect(res.status).toBe('success');
      expect(res.output).toContain('"result": "ok"');
      expect(res.output).toContain('"data": 123');
    });

    it('handles JSON stdout that contains an error status', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ 
        stdout: JSON.stringify({ status: 'error', error: 'Internal JSON Error' }) 
      });
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      const res = await mod.run({ target: '127.0.0.1' });
      expect(res.status).toBe('error');
      expect(res.output).toBe('Internal JSON Error');
    });

    it('handles non-JSON stdout correctly', async () => {
      mockRunnerService.runModuleOnHost.mockResolvedValueOnce({ stdout: 'Plain text output' });
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      const res = await mod.run({ target: '127.0.0.1' });
      expect(res.status).toBe('success');
      expect(res.output).toBe('Plain text output');
    });

    it('catches and returns exceptions as errors', async () => {
      mockRunnerService.runModuleOnHost.mockRejectedValueOnce(new Error('Network error'));
      const mod = new RemoteModule(mockRunner, mockModuleData);
      
      const res = await mod.run({ target: '127.0.0.1' });
      expect(res.status).toBe('error');
      expect(res.output).toBe('Network error');
    });
  });
});
