class MockWebSocket {
    constructor(url) {
        this.url = url;
        this.readyState = WebSocket.CONNECTING;
        this.listeners = {};
        MockWebSocket.instances.push(this);
        
        // Simulate immediate connection
        setTimeout(() => {
            this.readyState = WebSocket.OPEN;
            if (this.onopen) this.onopen();
            this.dispatchEvent(new Event('open'));
        }, 0);
    }
    
    addEventListener(type, listener) {
        if (!this.listeners[type]) this.listeners[type] = [];
        this.listeners[type].push(listener);
    }

    dispatchEvent(event) {
        if (this.listeners[event.type]) {
            this.listeners[event.type].forEach(l => l(event));
        }
    }
    
    send(data) {
        MockWebSocket.sentMessages.push(data);
    }
    
    close() {
        this.readyState = WebSocket.CLOSED;
        if (this.onclose) this.onclose();
    }
    
    simulateMessage(data) {
        const ev = { data: typeof data === 'string' ? data : JSON.stringify(data), type: 'message' };
        if (this.onmessage) {
            this.onmessage(ev);
        }
        this.dispatchEvent(ev);
    }
}

MockWebSocket.CONNECTING = 0;
MockWebSocket.OPEN = 1;
MockWebSocket.CLOSING = 2;
MockWebSocket.CLOSED = 3;
MockWebSocket.instances = [];
MockWebSocket.sentMessages = [];
MockWebSocket.clear = () => {
    MockWebSocket.instances = [];
    MockWebSocket.sentMessages = [];
};

global.WebSocket = MockWebSocket;

module.exports = { MockWebSocket };
