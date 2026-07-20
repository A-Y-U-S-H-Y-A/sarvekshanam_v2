const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.API = {
    commands: {
        list: jest.fn().mockResolvedValue({ commands: [{ id: 'cmd1', command: 'whoami', status: 'pending', username: 'testuser' }] }),
        submit: jest.fn().mockResolvedValue({}),
        approve: jest.fn().mockResolvedValue({}),
        reject: jest.fn().mockResolvedValue({})
    },
    runners: {
        list: jest.fn().mockResolvedValue([{ id: 'r1', name: 'Runner 1', status: 'online' }])
    }
};

global.WsClient = { on: jest.fn() };
global.showToast = jest.fn();
global.Auth = { getUser: jest.fn().mockReturnValue({ username: 'admin', role: 'admin' }) };
global.prompt = jest.fn();
global.Dialog = { prompt: jest.fn(), confirm: jest.fn(), alert: jest.fn() };

const cmdCode = fs.readFileSync(path.resolve(__dirname, '../../js/commands.js'), 'utf8');
let Commands;
eval(cmdCode.replace('const Commands =', 'Commands ='));

describe('Commands Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        global.Dialog.prompt.mockResolvedValue('Not allowed');
    });

    afterEach(() => {
        clearDom();
    });

    it('loads commands and renders list', async () => {
        await Commands.init();
        
        const list = document.getElementById('cmd-list');
        expect(list.innerHTML).toContain('whoami');
        expect(list.innerHTML).toContain('pending');
        expect(list.innerHTML).toContain('Approve'); // admin UI
    });

    it('submits command', async () => {
        await Commands.init();
        document.getElementById('cmd-input').value = 'ls -la';
        document.getElementById('cmd-runner').value = 'r1';
        
        await Commands.submit();
        
        expect(API.commands.submit).toHaveBeenCalledWith('ls -la', 'r1');
        expect(document.getElementById('cmd-input').value).toBe('');
    });

    it('filters commands', async () => {
        await Commands.init();
        
        Commands.filter('approved');
        
        expect(API.commands.list).toHaveBeenCalledWith(expect.objectContaining({ status: 'approved' }));
    });

    it('approves command', async () => {
        await Commands.init();
        
        await Commands.approve('cmd1');
        
        expect(API.commands.approve).toHaveBeenCalledWith('cmd1');
        expect(global.showToast).toHaveBeenCalledWith('Command approved and executing…');
    });

    it('rejects command', async () => {
        await Commands.init();
        global.prompt.mockReturnValue('Not allowed');
        
        Commands.rejectPrompt('cmd1');
        await new Promise(r => setTimeout(r, 0)); // let async run
        
        expect(API.commands.reject).toHaveBeenCalledWith('cmd1', 'Not allowed');
        expect(global.showToast).toHaveBeenCalledWith('Command rejected');
    });
});
