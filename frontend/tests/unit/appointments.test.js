const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

// Mock external dependencies
global.API = {
    appointments: {
        list: jest.fn(),
        create: jest.fn(),
        scans: jest.fn(),
        chats: jest.fn()
    }
};

global.showToast = jest.fn();
global.AIChat = { setAppointmentId: jest.fn(), clearAttachedSessions: jest.fn(), attachSessionId: jest.fn() };
global.PowerUser = { refreshSessions: jest.fn() };
global.Auth = { getUser: jest.fn().mockReturnValue({ role: 'admin' }) };

// Load the module code
const appointmentsCode = fs.readFileSync(path.resolve(__dirname, '../../js/appointments.js'), 'utf8');
let Appointments;
eval(appointmentsCode.replace('const Appointments =', 'Appointments ='));

describe('Appointments Module', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        
        // Setup mock return structures exactly matching backend API
        global.API.appointments.list.mockResolvedValue({
            appointments: [
                { id: 'appt-1', name: 'Test Appt 1', mode: 'manual', createdAt: new Date().toISOString() },
                { id: 'appt-2', name: 'Test Appt 2', mode: 'auto', createdAt: new Date(Date.now() - 10000).toISOString() }
            ],
            total: 2
        });
        
        global.API.appointments.create.mockResolvedValue({
            appointment: { id: 'appt-new', name: 'New Appt', mode: 'manual', createdAt: new Date().toISOString() }
        });
        
        global.API.appointments.scans.mockResolvedValue({
            scans: [
                { id: 'scan-1', name: 'Nmap Scan', status: 'completed', createdAt: new Date().toISOString() }
            ]
        });
        
        global.API.appointments.chats.mockResolvedValue({
            chats: [
                { id: 'chat-1', provider: 'Mock', model: 'Model-1', createdAt: new Date().toISOString() }
            ]
        });
    });

    afterEach(() => {
        clearDom();
    });

    it('fetchAll populates list correctly using .appointments nested array', async () => {
        await Appointments.fetchAll();
        
        expect(global.API.appointments.list).toHaveBeenCalled();
        const listEl = document.getElementById('appointments-list');
        expect(listEl.innerHTML).toContain('Test Appt 1');
        expect(listEl.innerHTML).toContain('Test Appt 2');
    });

    it('submitCreate calls API and extracts appointment ID from nested object', async () => {
        // Setup the form
        document.getElementById('appt-name-input').value = 'New Appt';
        document.getElementById('appt-mode-input').value = 'manual';
        
        // Create mock event
        const mockEvent = { preventDefault: jest.fn() };
        
        await Appointments.submitCreate(mockEvent);
        
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        expect(global.API.appointments.create).toHaveBeenCalledWith({ name: 'New Appt', mode: 'manual' });
        
        // It should have auto-selected the new appointment
        expect(Appointments.getActive()).toBe('appt-new');
        
        // It should have called AIChat to notify of context change
        expect(global.AIChat.setAppointmentId).toHaveBeenCalledWith('appt-new');
    });

    it('viewDetail extracts nested arrays and renders scans/chats', async () => {
        // Load data first to populate _appointments
        await Appointments.fetchAll();
        
        // Add stub to scrollIntoView to prevent error in JSDOM
        window.HTMLElement.prototype.scrollIntoView = jest.fn();
        
        await Appointments.viewDetail('appt-1');
        
        // Wait for setTimeout in viewDetail to execute
        await new Promise(r => setTimeout(r, 60));
        
        expect(global.API.appointments.scans).toHaveBeenCalledWith('appt-1');
        expect(global.API.appointments.chats).toHaveBeenCalledWith('appt-1');
        
        const detailPanel = document.getElementById('appointment-detail');
        expect(detailPanel.classList.contains('hidden')).toBe(false);
        
        const scansList = document.getElementById('appt-scans-list');
        expect(scansList.innerHTML).toContain('Nmap Scan');
        
        const chatsList = document.getElementById('appt-chats-list');
        expect(chatsList.innerHTML).toContain('Mock');
    });
});
