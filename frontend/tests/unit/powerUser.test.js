const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.API = {
    modules: {
        list: jest.fn().mockResolvedValue({ categories: { Network: [{ id: 'nmap', name: 'Nmap', description: 'Network scanner', category: 'Network', parameters: [{ name: 'target', required: true, type: 'text' }] }] } })
    },
    runners: {
        list: jest.fn().mockResolvedValue([])
    },
    scans: {
        create: jest.fn(),
        list: jest.fn().mockResolvedValue({ sessions: [] }),
        get: jest.fn()
    }
};

global.WsClient = {
    on: jest.fn(),
    subscribe: jest.fn()
};

global.showToast = jest.fn();
global.alert = jest.fn();
global.Dialog = { alert: jest.fn(), confirm: jest.fn(), prompt: jest.fn() };
global.App = { switchTab: jest.fn() };
global.AIChat = { setSession: jest.fn(), focusInput: jest.fn() };
global.Appointments = { getActive: jest.fn() };

const puCode = fs.readFileSync(path.resolve(__dirname, '../../js/powerUser.js'), 'utf8');
let PowerUser;
eval(puCode.replace('const PowerUser =', 'PowerUser ='));

describe('Power User Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        global.Appointments.getActive.mockReturnValue('appt-test');
    });

    afterEach(() => {
        clearDom();
    });

    it('loads and renders module tree', async () => {
        await PowerUser.init();
        
        const tree = document.getElementById('module-tree');
        expect(tree.innerHTML).toContain('Nmap');
        expect(tree.innerHTML).toContain('Network');
    });

    it('selects module and renders config', async () => {
        await PowerUser.init();
        PowerUser.selectModule('nmap');
        
        expect(document.getElementById('module-config').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('module-title').textContent).toBe('Nmap');
        expect(document.getElementById('module-params').innerHTML).toContain('param-target');
    });

    it('runs scan and updates UI', async () => {
        global.API.scans.create.mockResolvedValue({ session: { id: 'test-sess', status: 'pending' } });
        await PowerUser.init();
        PowerUser.selectModule('nmap');
        
        document.getElementById('param-target').value = '127.0.0.1';
        
        await PowerUser.runScan();
        
        expect(API.scans.create).toHaveBeenCalled();
        const args = API.scans.create.mock.calls[0][0];
        expect(args.target).toBe('127.0.0.1');
        expect(args.moduleIds).toEqual(['nmap']);
        
        expect(document.getElementById('results-card').classList.contains('hidden')).toBe(false);
        expect(global.WsClient.subscribe).toHaveBeenCalledWith('test-sess');
    });
    
    it('alerts if target is missing', async () => {
        await PowerUser.init();
        PowerUser.selectModule('nmap');
        document.getElementById('param-target').value = '';
        
        await PowerUser.runScan();
        expect(global.Dialog.alert).toHaveBeenCalledWith('Target is required');
        expect(API.scans.create).not.toHaveBeenCalled();
    });
});
