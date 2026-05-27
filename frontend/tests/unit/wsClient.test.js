const { setupDom, clearDom } = require('../helpers/dom');
const { MockWebSocket } = require('../helpers/mockWebSocket');
const fs = require('fs');
const path = require('path');

global.API = {
    getToken: jest.fn()
};
global.showToast = jest.fn();

const wsCode = fs.readFileSync(path.resolve(__dirname, '../../js/wsClient.js'), 'utf8');
let WsClient;
eval(wsCode.replace('const WsClient =', 'WsClient ='));

describe('WebSocket Client', () => {
    beforeEach(() => {
        setupDom();
        MockWebSocket.clear();
        global.API.getToken.mockReset();
        global.showToast.mockReset();
        WsClient.disconnect();
    });

    afterEach(() => {
        clearDom();
    });

    it('connects and sends AUTH token if present', (done) => {
        global.API.getToken.mockReturnValue('test-token');
        WsClient.connect();
        
        setTimeout(() => {
            expect(MockWebSocket.instances.length).toBe(1);
            expect(MockWebSocket.sentMessages).toContain(JSON.stringify({ type: 'AUTH', token: 'test-token' }));
            done();
        }, 10);
    });

    it('handles QUEUE_UPDATE message', (done) => {
        WsClient.connect();
        
        setTimeout(() => {
            const ws = MockWebSocket.instances[0];
            ws.simulateMessage({ type: 'QUEUE_UPDATE', data: { position: 3, estimatedWaitMs: 5000, sessionId: '123456789' } });
            
            const badge = document.getElementById('queue-depth-badge');
            const label = document.getElementById('queue-depth-label');
            
            expect(badge.classList.contains('hidden')).toBe(false);
            expect(label.textContent).toContain('3 queued');
            
            ws.simulateMessage({ type: 'QUEUE_UPDATE', data: { position: 0, estimatedWaitMs: 0, sessionId: '123456789' } });
            expect(badge.classList.contains('hidden')).toBe(true);
            expect(global.showToast).toHaveBeenCalled();
            done();
        }, 10);
    });

    it('subscribes to sessions', (done) => {
        WsClient.subscribe('sess-1');
        WsClient.connect();
        
        setTimeout(() => {
            expect(MockWebSocket.sentMessages).toContain(JSON.stringify({ type: 'SUBSCRIBE', sessionId: 'sess-1' }));
            
            WsClient.unsubscribe('sess-1');
            expect(MockWebSocket.sentMessages).toContain(JSON.stringify({ type: 'UNSUBSCRIBE', sessionId: 'sess-1' }));
            done();
        }, 10);
    });

    it('dispatches custom event handlers', (done) => {
        WsClient.connect();
        const handler = jest.fn();
        WsClient.on('CUSTOM_EVENT', handler);
        
        setTimeout(() => {
            const ws = MockWebSocket.instances[0];
            ws.simulateMessage({ type: 'CUSTOM_EVENT', data: 123 });
            
            expect(handler).toHaveBeenCalledWith({ type: 'CUSTOM_EVENT', data: 123 });
            done();
        }, 10);
    });
});
