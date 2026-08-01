const fs = require('fs');
const path = './backend/tests/unit/aiService.test.js';
let content = fs.readFileSync(path, 'utf8');

const tests = `
  describe('Additional coverage', () => {
    let ai;
    beforeEach(() => {
      ai = new AIService();
    });

    it('getModel() handles anthropic and gemini', () => {
      expect(ai.getModel('anthropic', 'claude-3-5-sonnet-latest')).toBeDefined();
      expect(ai.getModel('gemini', 'gemini-1.5-pro')).toBeDefined();
    });

    it('buildMessages() handles ToolMessage and default', () => {
      const msgs = ai.buildMessages([
        { role: 'tool', content: 'tool out', tool_call_id: 'call_1', name: 'my_tool' },
        { role: 'unknown', content: 'hello' },
        { role: 'assistant', content: '', tool_calls: [{ name: 'test' }] }
      ]);
      expect(msgs[0]._type).toBe('tool');
      expect(msgs[0].tool_call_id).toBe('call_1');
      expect(msgs[1]._type).toBe('human');
      expect(msgs[2]._type).toBe('ai');
    });

    it('run_scan parsing edge cases', async () => {
      const tools = ai._getTools();
      const runTool = tools.find(t => t.name === 'run_scan');
      const res1 = await runTool.func(JSON.stringify({ input: JSON.stringify({ moduleId: 'scan-1', target: 'localhost' }) }));
      expect(res1).toContain('session-1');
      
      const res2 = await runTool.func(JSON.stringify({ input: { moduleId: 'scan-1', target: 'localhost' } }));
      expect(res2).toContain('session-1');
    });

    it('get_scan_info / get_scan_results parses input object', async () => {
      const tools = ai._getTools();
      const infoTool = tools.find(t => t.name === 'get_scan_info');
      expect(await infoTool.func(JSON.stringify({ id: 'scan-1' }))).toContain('Scan 1');
      
      const getTool = tools.find(t => t.name === 'get_scan_results');
      expect(await getTool.func(JSON.stringify({ id: 'session-1' }))).toContain('completed');
    });

    it('run_scan massive results branching', async () => {
      const tools = ai._getTools();
      const runTool = tools.find(t => t.name === 'run_scan');
      const chunkingSvc = require('../../src/services/chunkingService');
      const orig = chunkingSvc.getChunkingService;
      chunkingSvc.getChunkingService = () => ({ estimateTokens: () => 5000 });
      const res = await runTool.func(JSON.stringify({ moduleId: 'scan-1', target: 'localhost' }));
      expect(res).toContain('Results too large');
      chunkingSvc.getChunkingService = orig;
    });

    it('rag_search with appointment context', async () => {
      const tools = ai._getTools('appt-1');
      const ragTool = tools.find(t => t.name === 'rag_search');
      
      const apptSvc = require('../../src/services/appointmentService');
      const orig = apptSvc.getAppointmentService;
      apptSvc.getAppointmentService = () => ({ getFullContext: async () => ({ scans: [{ id: 'doc1' }] }) });
      
      const res = await ragTool.func(JSON.stringify({ query: 'hello' }));
      expect(res).toContain('rag result');
      
      apptSvc.getAppointmentService = orig;
    });

    it('stream with pending tools', async () => {
      const chunks = [];
      const gen = ai.stream({
        provider: 'groq',
        messages: [{ role: 'user', content: 'hi' }],
        pendingToolCalls: [{ id: 'call_1', name: 'list_available_scans', args: {} }],
        denyTools: false
      });
      for await (const c of gen) chunks.push(c);
      expect(chunks.some(c => c.includes('list_available_scans'))).toBe(true);
    });

    it('stream with pending tools denied', async () => {
      const chunks = [];
      const gen = ai.stream({
        provider: 'groq',
        messages: [{ role: 'user', content: 'hi' }],
        pendingToolCalls: [{ id: 'call_1', name: 'run_scan', args: {} }],
        denyTools: true
      });
      for await (const c of gen) chunks.push(c);
      expect(chunks.some(c => c.includes('Execution denied'))).toBe(true);
    });

    it('_chunkText handles arrays', () => {
      expect(ai._chunkText([{ text: 'a' }, { text: 'b' }])).toBe('ab');
    });

    it('_compactScanResults cleans data', () => {
      const obj = { raw: 'delete-me', info: 'keep' };
      const res = ai._compactScanResults(obj);
      expect(res.raw).toBeUndefined();
      expect(res.info).toBe('keep');
    });
    
    it('_toolDisplayName and _formatApprovedToolSummary', () => {
      expect(ai._toolDisplayName('list_available_scans')).toBe('Discovering available scans');
      const summary = ai._formatApprovedToolSummary('get_scan_info', JSON.stringify({ name: 'Scan X' }));
      expect(summary).toContain('Scan X');
    });
  });
`;

if (!content.includes('Additional coverage')) {
  content = content.replace(/}\);\s*$/, tests + '\n});\n');
  fs.writeFileSync(path, content);
  console.log('aiService.test.js updated');
} else {
  console.log('already updated');
}
