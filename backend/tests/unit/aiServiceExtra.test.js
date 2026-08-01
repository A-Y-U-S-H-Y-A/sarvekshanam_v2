const { getAIService } = require('../../src/services/aiService');
const aiModelsStore = require('../../src/services/aiModelsStore');

jest.mock('../../src/services/aiModelsStore', () => ({
  setModels: jest.fn()
}));

// Mock fetch globally
global.fetch = jest.fn();

describe('aiService extra tests', () => {
  let aiService;

  beforeEach(() => {
    aiService = getAIService();
    jest.clearAllMocks();
  });

  it('compacts scan results with found headers', () => {
    const results = {
      'target1': {
        'mod1': {
          status: 'success',
          output: JSON.stringify({
            found_headers: { 'X-Frame-Options': 'DENY' },
            missing_headers: ['Strict-Transport-Security']
          })
        }
      }
    };
    const compacted = aiService._summarizeScanResults(results) || '';
    expect(compacted).toContain('Present headers: X-Frame-Options=DENY');
    expect(compacted).toContain('Missing headers: Strict-Transport-Security');
  });

  it('compacts scan results with ports', () => {
    const results = {
      'target1': {
        'mod1': {
          status: 'success',
          output: JSON.stringify({
            data: {
              host: '127.0.0.1',
              openCount: 1,
              ports: [{ port: 80, state: 'open', service: 'http' }]
            }
          })
        }
      }
    };
    const compacted = aiService._summarizeScanResults(results) || '';
    expect(compacted).toContain('Host: 127.0.0.1');
    expect(compacted).toContain('Open ports: 1');
    expect(compacted).toContain('Ports: 80 open http');
  });

  it('compacts scan results with hosts', () => {
    const results = {
      'target1': {
        'mod1': {
          status: 'success',
          output: JSON.stringify({
            data: {
              totalScanned: 1,
              hostsUp: 1,
              hosts: [{ host: '127.0.0.1', latency: '1ms' }]
            }
          })
        }
      }
    };
    const compacted = aiService._summarizeScanResults(results) || '';
    expect(compacted).toContain('Total scanned: 1');
    expect(compacted).toContain('Hosts up: 1');
    expect(compacted).toContain('Hosts: 127.0.0.1 (1ms)');
  });

  it('fetchModelsFromAPI openai', async () => {
    require('../../src/config').openaiApiKey = 'test';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'gpt-4o' }] })
    });
    const models = await aiService.fetchModelsFromAPI('openai');
    expect(models).toEqual(['gpt-4o']);
    expect(aiModelsStore.setModels).toHaveBeenCalledWith('openai', ['gpt-4o']);
  });

  it('fetchModelsFromAPI groq', async () => {
    require('../../src/config').groqApiKey = 'test';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'llama3' }] })
    });
    const models = await aiService.fetchModelsFromAPI('groq');
    expect(models).toEqual(['llama3']);
  });
  
  it('fetchModelsFromAPI anthropic', async () => {
    require('../../src/config').anthropicApiKey = 'test';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [{ id: 'claude-3-5' }] })
    });
    const models = await aiService.fetchModelsFromAPI('anthropic');
    expect(models).toEqual(['claude-3-5']);
  });
  
  it('fetchModelsFromAPI gemini', async () => {
    require('../../src/config').geminiApiKey = 'test';
    global.fetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ models: [{ name: 'models/gemini' }] })
    });
    const models = await aiService.fetchModelsFromAPI('gemini');
    expect(models).toEqual(['gemini']);
  });
});
