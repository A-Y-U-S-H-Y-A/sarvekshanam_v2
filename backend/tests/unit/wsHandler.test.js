'use strict';

process.env.NODE_ENV = 'test';

const { WsHandler, getWsHandler, _resetWsHandler } = require('../../src/ws/wsHandler');
const jwt = require('jsonwebtoken');
const config = require('../../src/config');
const EventEmitter = require('events');
const WebSocket = require('ws');

describe('WsHandler Unit Tests', () => {
  let wsHandler;
  let mockWss;
  let mockScanService;
  let mockCommandService;
  let mockAppointmentService;

  beforeEach(() => {
    wsHandler = new WsHandler();
    mockWss = new EventEmitter();
    
    mockScanService = new EventEmitter();
    mockCommandService = new EventEmitter();
    mockAppointmentService = new EventEmitter();

    wsHandler.attach(mockWss, { 
      scanSessionService: mockScanService, 
      commandService: mockCommandService,
      appointmentService: mockAppointmentService
    });
  });

  function createMockWs() {
    const ws = new EventEmitter();
    ws.readyState = WebSocket.OPEN;
    ws.send = jest.fn();
    return ws;
  }

  describe('Connection & Disconnection', () => {
    it('should track connected clients', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      expect(wsHandler.clientCount).toBe(1);
    });

    it('should cleanup on client disconnect', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      ws.emit('close');
      expect(wsHandler.clientCount).toBe(0);
    });

    it('should handle invalid JSON messages gracefully', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      ws.emit('message', 'invalid-json');
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ERROR', message: 'Invalid JSON' }));
    });

    it('should handle unknown message types', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      ws.emit('message', JSON.stringify({ type: 'UNKNOWN' }));
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ERROR', message: 'Unknown message type: UNKNOWN' }));
    });
  });

  describe('Authentication (AUTH)', () => {
    it('should handle successful authentication for user', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      
      const token = jwt.sign({ id: 'u1', username: 'test', role: 'user' }, config.jwtSecret);
      ws.emit('message', JSON.stringify({ type: 'AUTH', token }));
      
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'AUTH_OK',
        user: { id: 'u1', username: 'test', role: 'user' }
      }));
      expect(wsHandler._admins.has(ws)).toBe(false);
    });

    it('should handle successful authentication for admin', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      
      const token = jwt.sign({ id: 'a1', role: 'admin' }, config.jwtSecret);
      ws.emit('message', JSON.stringify({ type: 'AUTH', token }));
      
      expect(wsHandler._admins.has(ws)).toBe(true);
    });

    it('should return AUTH_ERROR for invalid token', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      
      ws.emit('message', JSON.stringify({ type: 'AUTH', token: 'bad-token' }));
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'AUTH_ERROR', message: 'Invalid or expired token' }));
    });
  });

  describe('Subscriptions', () => {
    let ws;
    beforeEach(() => {
      ws = createMockWs();
      mockWss.emit('connection', ws);
      const token = jwt.sign({ id: 'u1', role: 'user' }, config.jwtSecret);
      ws.emit('message', JSON.stringify({ type: 'AUTH', token }));
    });

    it('should require auth for SUBSCRIBE', () => {
      const unauthWs = createMockWs();
      mockWss.emit('connection', unauthWs);
      unauthWs.emit('message', JSON.stringify({ type: 'SUBSCRIBE', sessionId: 's1' }));
      
      expect(unauthWs.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ERROR', message: 'Authenticate first' }));
    });

    it('should require sessionId for SUBSCRIBE', () => {
      ws.emit('message', JSON.stringify({ type: 'SUBSCRIBE' }));
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'ERROR', message: 'sessionId required' }));
    });

    it('should subscribe to a session', () => {
      ws.emit('message', JSON.stringify({ type: 'SUBSCRIBE', sessionId: 's1' }));
      expect(wsHandler._sessionSubs.get('s1').has(ws)).toBe(true);
    });

    it('should unsubscribe from a session', () => {
      ws.emit('message', JSON.stringify({ type: 'SUBSCRIBE', sessionId: 's1' }));
      ws.emit('message', JSON.stringify({ type: 'UNSUBSCRIBE', sessionId: 's1' }));
      expect(wsHandler._sessionSubs.get('s1').has(ws)).toBe(false);
    });

    it('should handle ping', () => {
      ws.emit('message', JSON.stringify({ type: 'PING' }));
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({ type: 'PONG' }));
    });
  });

  describe('Event Broadcasts', () => {
    it('should broadcast SCAN_UPDATE to session subscribers', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      const token = jwt.sign({ id: 'u1', role: 'user' }, config.jwtSecret);
      ws.emit('message', JSON.stringify({ type: 'AUTH', token }));
      ws.emit('message', JSON.stringify({ type: 'SUBSCRIBE', sessionId: 's1' }));
      
      mockScanService.emit('session:update', { id: 's1', status: 'running' });
      
      expect(ws.send).toHaveBeenCalledWith(JSON.stringify({
        type: 'SCAN_UPDATE',
        session: { id: 's1', status: 'running' }
      }));
    });

    it('should broadcast COMMAND_STATUS to admins and submitter', () => {
      const adminWs = createMockWs();
      mockWss.emit('connection', adminWs);
      adminWs.emit('message', JSON.stringify({ type: 'AUTH', token: jwt.sign({ id: 'admin', role: 'admin' }, config.jwtSecret) }));

      const submitterWs = createMockWs();
      mockWss.emit('connection', submitterWs);
      submitterWs.emit('message', JSON.stringify({ type: 'AUTH', token: jwt.sign({ id: 'u1', role: 'user' }, config.jwtSecret) }));

      const otherWs = createMockWs();
      mockWss.emit('connection', otherWs);
      otherWs.emit('message', JSON.stringify({ type: 'AUTH', token: jwt.sign({ id: 'u2', role: 'user' }, config.jwtSecret) }));

      mockCommandService.emit('command:update', { id: 'c1', userId: 'u1' });

      const expectedMsg = JSON.stringify({ type: 'COMMAND_STATUS', command: { id: 'c1', userId: 'u1' } });
      expect(adminWs.send).toHaveBeenCalledWith(expectedMsg);
      expect(submitterWs.send).toHaveBeenCalledWith(expectedMsg);
      expect(otherWs.send).not.toHaveBeenCalledWith(expectedMsg);
    });

    it('should broadcast APPOINTMENT_UPDATE to all clients', () => {
      const ws1 = createMockWs();
      const ws2 = createMockWs();
      mockWss.emit('connection', ws1);
      mockWss.emit('connection', ws2);

      mockAppointmentService.emit('appointment:update', { id: 'app1' });
      
      const expectedMsg = JSON.stringify({ type: 'APPOINTMENT_UPDATE', appointment: { id: 'app1' } });
      expect(ws1.send).toHaveBeenCalledWith(expectedMsg);
      expect(ws2.send).toHaveBeenCalledWith(expectedMsg);
    });
  });

  describe('Error handling', () => {
    it('should catch and log ws error', () => {
      const ws = createMockWs();
      mockWss.emit('connection', ws);
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      
      ws.emit('error', new Error('WS dropped'));
      
      expect(consoleSpy).toHaveBeenCalledWith('[WS] Client error:', 'WS dropped');
      consoleSpy.mockRestore();
    });
  });

  describe('Singleton', () => {
    it('getWsHandler() returns a singleton instance', () => {
      _resetWsHandler();
      const instance1 = getWsHandler();
      const instance2 = getWsHandler();
      expect(instance1).toBe(instance2);
      expect(instance1).toBeInstanceOf(WsHandler);
    });
  });
});
