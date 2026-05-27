const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.API = {
    ai: {
        providers: jest.fn().mockResolvedValue({
            providers: [{ id: 'mock', name: 'MockProvider', defaultModel: 'mock-model', configured: true }]
        }),
        chat: jest.fn()
    },
    rag: {
        stats: jest.fn().mockResolvedValue({ stats: { totalCount: 42 } }),
        search: jest.fn().mockResolvedValue({ results: [{ docId: 'doc1', score: 0.9, content: 'Test content' }] })
    },
    appointments: {
        chats: jest.fn().mockResolvedValue({ chats: [] }),
        scans: jest.fn().mockResolvedValue({ scans: [] })
    }
};

global.WsClient = { on: jest.fn(), subscribe: jest.fn() };
global.showToast = jest.fn();
global.PowerUser = { getActiveSession: jest.fn() };
global.Auth = { getUser: jest.fn().mockReturnValue({ username: 'tester' }) };

const aiCode = fs.readFileSync(path.resolve(__dirname, '../../js/aiChat.js'), 'utf8');
let AIChat;
eval(aiCode.replace('const AIChat =', 'AIChat ='));

describe('AI Chat Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
    });

    afterEach(() => {
        clearDom();
    });

    it('loads providers and rag stats on init', async () => {
        await AIChat.init();
        
        expect(document.getElementById('ai-provider').innerHTML).toContain('MockProvider');
        expect(document.getElementById('ai-model').innerHTML).toContain('mock-model');
        expect(document.getElementById('rag-doc-count').textContent).toContain('42');
    });

    it('handles message send and streaming', async () => {
        await AIChat.init();
        await AIChat.setAppointmentId('appt-test');
        
        document.getElementById('chat-input').value = 'Hello AI';
        
        global.API.ai.chat.mockImplementation((opts, onChunk, onDone) => {
            onChunk('Hello ');
            onChunk('User');
            onDone();
            return { abort: jest.fn() };
        });
        
        await AIChat.send();
        
        const messages = document.getElementById('chat-messages').children;
        expect(messages.length).toBe(2);
        expect(messages[0].innerHTML).toContain('Hello AI');
        expect(messages[1].innerHTML).toContain('Hello User');
    });

    it('attaches session', () => {
        PowerUser.getActiveSession.mockReturnValue('session123');
        AIChat.attachSession();
        
        expect(global.WsClient.subscribe).toHaveBeenCalledWith('session123');
        expect(document.getElementById('ai-context-indicator').textContent).toContain('session(s) attached');
    });

    it('searches RAG and attaches context', async () => {
        document.getElementById('rag-search-input').value = 'query';
        await AIChat.ragSearch();
        
        expect(API.rag.search).toHaveBeenCalledWith('query');
        const list = document.getElementById('rag-results-list');
        expect(list.innerHTML).toContain('Test content');
        
        AIChat.attachRagResult('Test content');
        expect(document.getElementById('chat-input').value).toContain('Test content');
    });
});
