const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.API = {
    runners: {
        list: jest.fn().mockResolvedValue([{ id: 'r1', name: 'Runner1', status: 'online', url: 'http://localhost:8080', group: 'group1' }]),
        create: jest.fn().mockResolvedValue({}),
        delete: jest.fn().mockResolvedValue({})
    },
    groups: {
        list: jest.fn().mockResolvedValue([{ id: 'g1', name: 'Group1', manifest_hash: 'abcdef123' }])
    }
};

global.showToast = jest.fn();
global.alert = jest.fn();
global.confirm = jest.fn();
global.Dialog = { confirm: jest.fn(), prompt: jest.fn(), alert: jest.fn() };

const rCode = fs.readFileSync(path.resolve(__dirname, '../../js/runners.js'), 'utf8');
let Runners;
// The js file defines "const Runners = {...}"
eval(rCode.replace('const Runners =', 'Runners ='));

describe('Runners Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        global.Dialog.confirm.mockResolvedValue(true);
    });

    afterEach(() => {
        clearDom();
    });

    it('loads runners and groups', async () => {
        await Runners.load();
        
        const rList = document.getElementById('runners-list');
        expect(rList.innerHTML).toContain('Runner1');
        expect(rList.innerHTML).toContain('online');
        
        const gList = document.getElementById('groups-list');
        expect(gList.innerHTML).toContain('Group1');
        expect(gList.innerHTML).toContain('abcdef12');
    });

    it('submits add form', async () => {
        Runners.showAddModal();
        document.getElementById('runner-name-input').value = 'New Runner';
        document.getElementById('runner-url-input').value = 'http://test';
        
        await Runners.submitAddForm({ preventDefault: jest.fn() });
        
        expect(API.runners.create).toHaveBeenCalledWith({ name: 'New Runner', url: 'http://test' });
        expect(global.showToast).toHaveBeenCalled();
        expect(document.getElementById('add-runner-modal').classList.contains('hidden')).toBe(true);
    });

    it('deletes runner', async () => {
        global.Dialog.confirm.mockResolvedValue(true);
        await Runners.delete('r1');
        
        expect(global.Dialog.confirm).toHaveBeenCalled();
        expect(API.runners.delete).toHaveBeenCalledWith('r1');
    });
});
