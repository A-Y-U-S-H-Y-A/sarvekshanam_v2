'use strict';

process.env.NODE_ENV = 'test';

const { AIService } = require('../../src/services/aiService');

// ── Mock LangChain providers ──────────────────────────────────────────────────
jest.mock('@langchain/groq', () => ({
  ChatGroq: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from Groq' }; })()),
    invoke: jest.fn().mockResolvedValue({ content: 'Hello from Groq' }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('@langchain/openai', () => ({
  ChatOpenAI: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from OpenAI' }; })()),
    invoke: jest.fn().mockResolvedValue({ content: 'Hello from OpenAI' }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('@langchain/ollama', () => ({
  ChatOllama: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from Ollama' }; })()),
    invoke: jest.fn().mockResolvedValue({ content: 'Hello from Ollama' }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}));

jest.mock('@langchain/mistralai', () => ({
  ChatMistralAI: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from Mistral' }; })()),
    invoke: jest.fn().mockResolvedValue({ content: 'Hello from Mistral' }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}), { virtual: true });

jest.mock('@langchain/cohere', () => ({
  ChatCohere: jest.fn().mockImplementation(() => ({
    stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from Cohere' }; })()),
    invoke: jest.fn().mockResolvedValue({ content: 'Hello from Cohere' }),
    bindTools: jest.fn().mockReturnThis(),
  })),
}), { virtual: true });

jest.mock('@langchain/core/messages', () => ({
  SystemMessage:  jest.fn(c => ({ _type: 'system',    content: c })),
  HumanMessage:   jest.fn(c => ({ _type: 'human',     content: c })),
  AIMessage:      jest.fn(function(args) { Object.assign(this, { _type: 'ai', ...args }); }),
  ToolMessage:    jest.fn(function(args) { Object.assign(this, { _type: 'tool', ...args }); }),
}));

jest.mock('@langchain/core/tools', () => ({
  DynamicTool: jest.fn().mockImplementation(args => args) // Just return the config object to allow testing the funcs
}));

// Mock internal dependencies
const mockRegistry = {
  getAll: jest.fn().mockReturnValue([{ id: 'scan-1', name: 'Scan 1', category: 'Cat' }]),
  getById: jest.fn((id) => id === 'scan-1' ? { id: 'scan-1', meta: { id: 'scan-1', name: 'Scan 1' } } : null)
};

const mockScanService = {
  create: jest.fn().mockReturnValue({ id: 'session-1' }),
  run: jest.fn().mockResolvedValue(),
  get: jest.fn((id) => id === 'session-1' ? { id: 'session-1', status: 'completed', results: {}, error: null } : null)
};

const mockVectorService = {
  search: jest.fn().mockResolvedValue([{ docId: '1', score: 0.9, content: 'rag result' }])
};

const mockAppointmentService = {
  getFullContext: jest.fn().mockResolvedValue(null),
  linkChat: jest.fn().mockResolvedValue({ id: 'chat-1', title: 'New Chat' })
};

jest.mock('../../src/modules/registry', () => ({ getRegistry: () => mockRegistry }));
jest.mock('../../src/services/scanSessionService', () => ({ getScanSessionService: () => mockScanService }));
jest.mock('../../src/services/vectorService', () => ({ getVectorService: () => mockVectorService }));
jest.mock('../../src/services/appointmentService', () => ({ getAppointmentService: () => mockAppointmentService }));

// Mock http for ollama models
const mockHttp = {
  get: jest.fn((options, callback) => {
    const res = {
      on: jest.fn((event, handler) => {
        if (event === 'data') handler(JSON.stringify({ models: [{ name: 'llama3' }] }));
        if (event === 'end') handler();
      })
    };
    callback(res);
    return { on: jest.fn() }; // req
  })
};
jest.mock('http', () => mockHttp);

describe('AIService', () => {
  let svc;
  beforeEach(() => {
    svc = new AIService();
    jest.clearAllMocks();
  });

  describe('Model Creation', () => {
    it('getModel() returns a groq model', () => {
      const model = svc.getModel('groq', 'llama-3.1-8b-instant');
      expect(model).toBeDefined();
    });

    it('getModel() returns an openai model', () => {
      const model = svc.getModel('openai', 'gpt-4o-mini');
      expect(model).toBeDefined();
    });

    it('getModel() returns an ollama model', () => {
      const model = svc.getModel('ollama', 'llama3');
      expect(model).toBeDefined();
    });

    it('getModel() returns a mistral model', () => {
      const model = svc.getModel('mistralai', 'mistral-large-latest');
      expect(model).toBeDefined();
    });

    it('getModel() returns a cohere model', () => {
      const model = svc.getModel('cohere', 'command-r-plus');
      expect(model).toBeDefined();
    });

    it('getModel() throws for unknown provider', () => {
      expect(() => svc.getModel('unknown', 'model')).toThrow('Unknown AI provider');
    });
  });

  describe('Message Building', () => {
    it('buildMessages() converts role/content pairs to LangChain messages', () => {
      const msgs = svc.buildMessages([
        { role: 'system',    content: 'You are a tester.' },
        { role: 'user',      content: 'Hello' },
        { role: 'assistant', content: 'Hi!' },
      ]);
      expect(msgs).toHaveLength(3);
      expect(msgs[0]._type).toBe('system');
      expect(msgs[1]._type).toBe('human');
      expect(msgs[2]._type).toBe('ai');
    });
  });

  describe('Streaming', () => {
    it('stream() yields chunks from groq', async () => {
      const chunks = [];
      const gen = svc.stream({
        provider: 'groq',
        model:    'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Test' }],
      });
      for await (const c of gen) chunks.push(c);
      expect(chunks).toContain('Hello from Groq');
    });

    it('stream() prepends session context as system message', async () => {
      const chunks = [];
      const gen = svc.stream({
        provider:       'groq',
        model:          'llama-3.1-8b-instant',
        messages:       [{ role: 'user', content: 'Explain' }],
        sessionContext: 'Scan result: open ports 22,80',
      });
      for await (const c of gen) chunks.push(c);
      expect(chunks.length).toBeGreaterThan(0);
    });

    it('stream() saves chat to appointment if appointmentId is provided', async () => {
      const gen = svc.stream({
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Test' }],
        appointmentId: 'appt-123'
      });
      for await (const c of gen) {} // consume
      
      expect(mockAppointmentService.linkChat).toHaveBeenCalledWith('appt-123', expect.objectContaining({
        provider: 'groq',
        messages: expect.arrayContaining([{ role: 'user', content: 'Test' }])
      }));
    });

    it('stream() executes tool calls correctly and handles tool execution errors', async () => {
      const mockChatGroq = require('@langchain/groq').ChatGroq;
      
      const streamGen = async function* () {
        yield {
          content: '',
          tool_calls: [
            { name: 'list_available_scans', id: 'call_1', args: '{}' },
            { name: 'run_scan', id: 'call_2', args: '{"target": "10.0.0.1"}' },
            { name: 'run_scan', id: 'call_3', args: { target: "10.0.0.2" } },
            { name: 'unknown_tool', id: 'call_4', args: '{}' },
            { name: 'error_tool', id: 'call_5', args: '{}' }
          ],
          concat: (other) => {
            if (other.causeConcatError) throw new Error('Concat error');
            return other;
          }
        };
        // Yield an object that triggers the concat catch block
        yield { causeConcatError: true };
      };
      
      const streamGen2 = async function* () {
        yield { content: 'Done list' };
      };
      
      const streamFn = jest.fn()
        .mockResolvedValueOnce(streamGen())
        .mockResolvedValueOnce(streamGen2());
      
      mockChatGroq.mockImplementation(() => ({
        stream: streamFn,
        bindTools: jest.fn().mockReturnThis()
      }));

      // Create dummy tools to hit specific tool.func paths
      const originalGetTools = svc._getTools.bind(svc);
      svc._getTools = () => [
        { name: 'list_available_scans', func: async () => '[]' },
        { name: 'run_scan', func: async () => '{"status":"ok"}' },
        { name: 'error_tool', func: async () => { throw new Error('Tool error'); } }
      ];

      const chunks = [];
      const gen = svc.stream({ provider: 'groq', messages: [] });
      for await (const c of gen) chunks.push(c);
      
      expect(chunks.some(c => c.includes('Discovering available scans'))).toBe(true);
      expect(chunks.some(c => c.includes('→ `10.0.0.1`'))).toBe(true);
      expect(chunks.some(c => c.includes('→ `10.0.0.2`'))).toBe(true);
      expect(chunks).toContain('Done list');
      
      // Revert mocks
      svc._getTools = originalGetTools;
      mockChatGroq.mockImplementation(() => ({
        stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello' }; })()),
        invoke: jest.fn().mockResolvedValue({ content: 'Hello from Groq' }),
        bindTools: jest.fn().mockReturnThis()
      }));
    });

    it('stream() infers a run_scan confirmation when a model returns an empty tool turn', async () => {
      const mockChatGroq = require('@langchain/groq').ChatGroq;
      mockChatGroq.mockImplementation(() => ({
        stream: jest.fn().mockResolvedValue((async function* () {
          yield { content: '', tool_calls: [], concat: other => other };
        })()),
        invoke: jest.fn().mockResolvedValue({ content: 'title' }),
        bindTools: jest.fn().mockReturnThis()
      }));

      const chunks = [];
      const gen = svc.stream({
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Run Scan 1 against 127.0.0.1' }]
      });
      for await (const c of gen) chunks.push(c);

      expect(chunks.some(c => c.includes('Launching scan'))).toBe(true);
      expect(chunks.some(c => c.includes('__TOOL_CONFIRMATION__'))).toBe(true);

      mockChatGroq.mockImplementation(() => ({
        stream: jest.fn().mockResolvedValue((async function* () { yield { content: 'Hello from Groq' }; })()),
        invoke: jest.fn().mockResolvedValue({ content: 'Hello from Groq' }),
        bindTools: jest.fn().mockReturnThis(),
      }));
    });
  });

  describe('Invoke', () => {
    it('invoke() returns the full AI response string', async () => {
      const res = await svc.invoke({
        provider: 'groq',
        model: 'llama-3.1-8b-instant',
        messages: [{ role: 'user', content: 'Hello' }],
        sessionContext: 'test'
      });
      expect(res).toBe('Hello from Groq');
    });
    
    it('invoke() returns JSON stringified content if response is an object', async () => {
      const mockChatGroq = require('@langchain/groq').ChatGroq;
      mockChatGroq.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({ content: { key: 'value' } }),
      }));
      const res = await svc.invoke({ provider: 'groq', messages: [] });
      expect(res).toBe('{"key":"value"}');
      
      // Revert
      mockChatGroq.mockImplementation(() => ({
        invoke: jest.fn().mockResolvedValue({ content: 'Hello' }),
      }));
    });

    it('_sanitizeChatTitle clamps verbose model output', () => {
      const verbose = 'HTTP Header Check Results\n\nThis should not become a giant sidebar title with findings and markdown.';
      expect(svc._sanitizeChatTitle(verbose, 'Run HTTP Header Check against https://haxnation.org')).toBe('HTTP Header Check Results');
      expect(svc._sanitizeChatTitle('One two three four five six seven eight nine', 'Fallback prompt title')).toBe('Fallback prompt title');
    });
  });

  describe('listProviders', () => {
    it('listProviders() returns a list of providers including ollama models via http', async () => {
      const providers = await svc.listProviders();
      expect(Array.isArray(providers)).toBe(true);
      
      const ollama = providers.find(p => p.id === 'ollama');
      expect(ollama).toBeDefined();
      expect(ollama.models).toContain('llama3');
    });

    it('_getOllamaModels() returns empty array on invalid JSON response', async () => {
      mockHttp.get.mockImplementationOnce((options, callback) => {
        const req = { on: jest.fn((event, handler) => {
          if (event === 'data') handler('invalid-json');
          if (event === 'end') handler();
        }) };
        callback(req);
        return { on: jest.fn() };
      });
      const models = await svc._getOllamaModels();
      expect(models).toEqual([]);
    });

    it('_getOllamaModels() returns empty array on general throw in request init', async () => {
      mockHttp.get.mockImplementationOnce(() => {
        throw new Error('Sync error');
      });
      const models = await svc._getOllamaModels();
      expect(models).toEqual([]);
    });

    it('_getOllamaModels() returns empty array on error', async () => {
      // Mock error on http request
      mockHttp.get.mockImplementationOnce((options, callback) => {
        const req = { on: jest.fn((event, handler) => {
          if (event === 'error') handler(new Error('Network error'));
        }) };
        return req;
      });
      const models = await svc._getOllamaModels();
      expect(models).toEqual([]);
    });

    it('_getOllamaModels() handles timeout', async () => {
      // Mock timeout
      mockHttp.get.mockImplementationOnce((options, callback) => {
        const req = {
          on: jest.fn((event, handler) => {
            if (event === 'timeout') handler();
          }),
          destroy: jest.fn()
        };
        return req;
      });
      const models = await svc._getOllamaModels();
      expect(models).toEqual([]);
    });
  });

  describe('Tools Implementation', () => {
    let tools;
    beforeEach(() => {
      tools = svc._getTools();
    });

    it('list_available_scans tool works', async () => {
      const listTool = tools.find(t => t.name === 'list_available_scans');
      const res = await listTool.func();
      const parsed = JSON.parse(res);
      expect(parsed).toHaveLength(1);
      expect(parsed[0].id).toBe('scan-1');
      
      mockRegistry.getAll.mockImplementationOnce(() => { throw new Error('Err'); });
      const resErr = await listTool.func();
      expect(resErr).toContain('error');
    });

    it('get_scan_info tool works', async () => {
      const infoTool = tools.find(t => t.name === 'get_scan_info');
      const res = await infoTool.func('scan-1');
      expect(res).toContain('Scan 1');
      
      const notFound = await infoTool.func('unknown');
      expect(notFound).toContain('not found');
      
      mockRegistry.getById.mockImplementationOnce(() => { throw new Error('Err'); });
      expect(await infoTool.func('test')).toContain('error');
    });

    it('run_scan tool works for direct match', async () => {
      const runTool = tools.find(t => t.name === 'run_scan');
      const input = JSON.stringify({ moduleId: 'scan-1', target: '127.0.0.1' });
      const res = await runTool.func(input);
      expect(res).toContain('session-1');
      expect(res).toContain('completed');
    });

    it('run_scan tool works for suffix match', async () => {
      const runTool = tools.find(t => t.name === 'run_scan');
      // Mock fuzzy match in getAll
      mockRegistry.getAll.mockReturnValueOnce([{ id: 'remote_xyz_scan-2', name: 'Scan 2' }]);
      mockRegistry.getById.mockImplementationOnce((id) => null); // exact match fails
      mockRegistry.getById.mockImplementationOnce((id) => ({ meta: { name: 'Scan 2' } })); // fuzzy match succeeds
      
      const input = JSON.stringify({ moduleId: 'scan-2', target: '127.0.0.1' });
      const res = await runTool.func(input);
      expect(res).toContain('session-1');
    });

    it('run_scan tool handles errors', async () => {
      const runTool = tools.find(t => t.name === 'run_scan');
      expect(await runTool.func('invalid-json')).toContain('error');
      expect(await runTool.func('{}')).toContain('moduleId is required');
      expect(await runTool.func('{"moduleId": "scan-1"}')).toContain('target is required');
      expect(await runTool.func('{"moduleId": "unknown", "target": "1"}')).toContain('not found');
      
      // execution error
      mockScanService.run.mockRejectedValueOnce(new Error('Failed to run'));
      const input = JSON.stringify({ moduleId: 'scan-1', target: '127.0.0.1' });
      expect(await runTool.func(input)).toContain('Failed to run');
    });

    it('get_scan_results tool works', async () => {
      const getTool = tools.find(t => t.name === 'get_scan_results');
      const res = await getTool.func('session-1');
      expect(res).toContain('completed');
      
      const notFound = await getTool.func('unknown');
      expect(notFound).toContain('not found');
      
      mockScanService.get.mockImplementationOnce(() => { throw new Error('Err'); });
      expect(await getTool.func('test')).toContain('error');
    });

    it('rag_search tool works', async () => {
      const ragTool = tools.find(t => t.name === 'rag_search');
      const res = await ragTool.func('query');
      expect(res).toContain('rag result');
      
      mockVectorService.search.mockResolvedValueOnce([]);
      expect(await ragTool.func('query')).toContain('No relevant information found');
      
      mockVectorService.search.mockRejectedValueOnce(new Error('RAG fail'));
      expect(await ragTool.func('query')).toContain('RAG search failed');
    });

    it('_inferRunScanToolCall extracts module, target, and nmap params from a clear prompt', () => {
      mockRegistry.getAll.mockReturnValueOnce([
        { id: 'remote_x_http-header-check', name: 'HTTP Header Check', description: 'headers' },
        { id: 'remote_x_nmap-port-scan', name: 'Nmap Port & Service Scan', description: 'ports' }
      ]);

      const call = svc._inferRunScanToolCall([
        { role: 'user', content: 'Run Nmap Port & Service Scan against 127.0.0.1 with ports 22,80,443 and timing T4' }
      ]);

      expect(call.name).toBe('run_scan');
      expect(call.args.moduleId).toBe('remote_x_nmap-port-scan');
      expect(call.args.target).toBe('127.0.0.1');
      expect(call.args.params).toEqual({ ports: '22,80,443', timing: 'T4' });
    });

    it('_inferToolCallsFromPrompt handles explicit safe discovery requests', () => {
      mockRegistry.getAll.mockReturnValueOnce([
        { id: 'remote_x_http-header-check', name: 'HTTP Header Check', description: 'headers' },
        { id: 'remote_x_nmap-port-scan', name: 'Nmap Port & Service Scan', description: 'ports' }
      ]);

      const calls = svc._inferToolCallsFromPrompt([
        { role: 'user', content: 'Call list_available_scans, then get_scan_info for Nmap Port & Service Scan. Do not run a scan.' }
      ]);

      expect(calls.map(c => c.name)).toEqual(['list_available_scans', 'get_scan_info']);
      expect(calls[1].args).toBe('remote_x_nmap-port-scan');
    });
  });
});
