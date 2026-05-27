const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

global.API = {
    modules: {
        list: jest.fn().mockResolvedValue({ categories: { Network: [{ id: 'nmap', name: 'Nmap', category: 'Network' }] } })
    },
    runners: {
        list: jest.fn().mockResolvedValue([])
    },
    scans: {
        bulk: jest.fn().mockResolvedValue({ sessions: [{ id: 'bulk1', status: 'pending', targets: ['1.1.1.1'], moduleIds: ['nmap'] }] }),
        list: jest.fn()
    }
};

global.WsClient = { on: jest.fn(), subscribe: jest.fn() };
global.showToast = jest.fn();
global.PowerUser = { attachSession: jest.fn() };
global.Appointments = { getActive: jest.fn() };

const bsCode = fs.readFileSync(path.resolve(__dirname, '../../js/bulkScan.js'), 'utf8');
let BulkScan;
eval(bsCode.replace('const BulkScan =', 'BulkScan ='));

describe('Bulk Scan Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        global.Appointments.getActive.mockReturnValue('appt-test');
    });

    afterEach(() => {
        clearDom();
    });

    it('loads modules and updates count badge', async () => {
        await BulkScan.init();
        
        const container = document.getElementById('bulk-modules');
        expect(container.innerHTML).toContain('Nmap');
        
        const badge = document.getElementById('bulk-count-badge');
        expect(badge.textContent).toBe('0 targets, 0 modules');
    });

    it('adds target and updates UI', async () => {
        await BulkScan.init();
        BulkScan.addTarget('1.1.1.1', 'nmap');
        
        expect(document.getElementById('bulk-targets').value).toBe('1.1.1.1');
        const checkbox = document.getElementById('bulk-mod-nmap');
        expect(checkbox.checked).toBe(true);
        
        expect(document.getElementById('bulk-count-badge').textContent).toBe('1 target, 1 module');
    });

    it('runs bulk scan', async () => {
        await BulkScan.init();
        document.getElementById('bulk-targets').value = '1.1.1.1\n8.8.8.8';
        const checkbox = document.getElementById('bulk-mod-nmap');
        checkbox.checked = true;
        
        await BulkScan.run();
        
        expect(API.scans.bulk).toHaveBeenCalled();
        const args = API.scans.bulk.mock.calls[0][0];
        expect(args.targets).toEqual(['1.1.1.1', '8.8.8.8']);
        expect(args.moduleIds).toEqual(['nmap']);
        
        expect(global.WsClient.subscribe).toHaveBeenCalledWith('bulk1');
        
        const progressList = document.getElementById('bulk-progress-list');
        expect(progressList.innerHTML).toContain('1.1.1.1');
    });

    it('validates empty target or modules', async () => {
        await BulkScan.init();
        
        await BulkScan.run();
        expect(global.showToast).toHaveBeenCalledWith('Enter at least one target', 'error');
        
        document.getElementById('bulk-targets').value = '1.1.1.1';
        await BulkScan.run();
        expect(global.showToast).toHaveBeenCalledWith('Select at least one module', 'error');
    });
});
