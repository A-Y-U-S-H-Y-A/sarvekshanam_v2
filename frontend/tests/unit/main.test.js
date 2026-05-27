const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.Auth = { init: jest.fn() };
global.WsClient = { connect: jest.fn() };
global.PowerUser = { init: jest.fn().mockResolvedValue() };
global.AIChat = { init: jest.fn().mockResolvedValue() };
global.BulkScan = { init: jest.fn().mockResolvedValue() };
global.Commands = { init: jest.fn().mockResolvedValue() };
global.Appointments = { init: jest.fn().mockResolvedValue() };
global.Runners = { load: jest.fn().mockResolvedValue() };

global.API = {
    settings: {
        getProxy: jest.fn().mockResolvedValue({ mode: 'none', target: '' }),
        setProxy: jest.fn().mockResolvedValue({})
    },
    keys: {
        list: jest.fn().mockResolvedValue({ data: [] }),
        create: jest.fn().mockResolvedValue({ data: { key: 'secret' } }),
        revoke: jest.fn().mockResolvedValue({})
    }
};

const mainCode = fs.readFileSync(path.resolve(__dirname, '../../js/main.js'), 'utf8');
let App;
eval(mainCode.replace('const App =', 'App =').replace('function showToast', 'global.showToast = function showToast'));

describe('Main App', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        
        // Mock prompt and confirm
        global.prompt = jest.fn();
        global.confirm = jest.fn();
    });

    afterEach(() => {
        clearDom();
    });

    it('boots and sets up user', async () => {
        global.Auth.init.mockResolvedValue({ username: 'testuser', role: 'user' });
        
        await App.boot();
        
        expect(document.getElementById('user-name').textContent).toBe('testuser');
        expect(WsClient.connect).toHaveBeenCalled();
        expect(PowerUser.init).toHaveBeenCalled();
    });

    it('switches tabs', () => {
        // App switchTab looks for #panel-{tab} and #tab-{tab}
        App.switchTab('ai');
        
        const panelAi = document.getElementById('panel-ai');
        const tabAi = document.getElementById('tab-ai');
        if (panelAi) expect(panelAi.classList.contains('active')).toBe(true);
        if (tabAi) expect(tabAi.classList.contains('active')).toBe(true);
    });

    it('shows toast', () => {
        showToast('Test message', 'success');
        
        const toastEl = document.getElementById('toast');
        expect(toastEl.textContent).toContain('Test message');
        expect(toastEl.classList.contains('visible')).toBe(true);
    });

    it('loads api keys in settings', async () => {
        global.API.keys.list.mockResolvedValue({ data: [{ id: 1, name: 'Key 1' }] });
        await App.loadApiKeys();
        
        const listEl = document.getElementById('api-keys-list');
        expect(listEl.innerHTML).toContain('Key 1');
    });
});
