const { setMockResponse, clearMockResponses } = require('../helpers/mockFetch');

const mockLocalStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: { getItem: jest.fn() } });

const fs = require('fs');
const path = require('path');
const apiCode = fs.readFileSync(path.resolve(__dirname, '../../js/api.js'), 'utf8');

let API;
eval(apiCode.replace('const API =', 'API ='));

describe('API Client', () => {
    beforeEach(() => {
        clearMockResponses();
        window.sessionStorage.getItem.mockReset();
    });

    it('injects auth token into headers if present', async () => {
        window.sessionStorage.getItem.mockReturnValue('test-token-123');
        setMockResponse('/auth/me', { success: true, data: { id: 1 } });
        
        await API.auth.me();
        
        expect(global.fetch).toHaveBeenCalled();
        const callArgs = global.fetch.mock.calls[0];
        expect(callArgs[1].headers.Authorization).toBe('Bearer test-token-123');
    });

    it('throws error on failure', async () => {
        setMockResponse('/api/modules', { success: false, error: { message: 'Not found' } }, 404);
        await expect(API.modules.list()).rejects.toThrow('Not found');
    });

    it('handles post requests', async () => {
        setMockResponse('/auth/login', { success: true, data: { token: 'abc' } });
        const res = await API.auth.login('user', 'pass');
        expect(res.token).toBe('abc');
        
        const callArgs = global.fetch.mock.calls[0];
        expect(callArgs[0]).toBe('/auth/login');
        expect(callArgs[1].method).toBe('POST');
        expect(JSON.parse(callArgs[1].body)).toEqual({ username: 'user', password: 'pass' });
    });
    
    it('sends POST request for list (search) with params', async () => {
        setMockResponse('/api/scans/search', { success: true, data: [] });
        await API.scans.list({ limit: 10 });
        const callArgs = global.fetch.mock.calls[0];
        expect(callArgs[0]).toBe('/api/scans/search');
        expect(callArgs[1].method).toBe('POST');
        expect(JSON.parse(callArgs[1].body)).toEqual({ limit: 10 });
    });
});
