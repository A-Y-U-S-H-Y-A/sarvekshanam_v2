const { setupDom, clearDom } = require('../helpers/dom');
const fs = require('fs');
const path = require('path');

const mockSessionStorage = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
};
Object.defineProperty(window, 'sessionStorage', { value: mockSessionStorage });

global.API = {
    auth: {
        oidcStatus: jest.fn().mockResolvedValue({ data: { enabled: false } }),
        me: jest.fn(),
        login: jest.fn(),
        register: jest.fn()
    }
};

global.App = { onLogin: jest.fn() };
global.WsClient = { disconnect: jest.fn() };

const authCode = fs.readFileSync(path.resolve(__dirname, '../../js/auth.js'), 'utf8');
let Auth;
eval(authCode.replace('const Auth =', 'Auth ='));

describe('Auth Client', () => {
    beforeEach(() => {
        setupDom();
        jest.clearAllMocks();
        mockSessionStorage.getItem.mockReset();
        window.history.replaceState = jest.fn();
    });

    afterEach(() => {
        clearDom();
    });

    it('shows overlay if no token', async () => {
        mockSessionStorage.getItem.mockReturnValue(null);
        await Auth.init();
        expect(document.getElementById('auth-overlay').classList.contains('hidden')).toBe(false);
        expect(document.getElementById('app').classList.contains('hidden')).toBe(true);
    });

    it('hides overlay if valid token', async () => {
        mockSessionStorage.getItem.mockReturnValue('valid');
        API.auth.me.mockResolvedValue({ user: { id: 1 } });
        await Auth.init();
        expect(document.getElementById('auth-overlay').style.display).toBe('none');
        expect(document.getElementById('app').classList.contains('hidden')).toBe(false);
    });

    it('submits login', async () => {
        API.auth.login.mockResolvedValue({ token: 'abc', user: { id: 1 } });
        Auth.showLogin();
        document.getElementById('auth-username').value = 'user';
        document.getElementById('auth-password').value = 'pass';
        
        await Auth.submit({ preventDefault: jest.fn() });
        
        expect(API.auth.login).toHaveBeenCalledWith('user', 'pass');
        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('sarv_token', 'abc');
        expect(App.onLogin).toHaveBeenCalledWith({ id: 1 });
        expect(document.getElementById('auth-overlay').style.display).toBe('none');
    });

    it('submits register', async () => {
        API.auth.register.mockResolvedValue({ token: 'def', user: { id: 2 } });
        Auth.showRegister();
        document.getElementById('auth-username').value = 'user2';
        document.getElementById('auth-password').value = 'pass2';
        
        await Auth.submit({ preventDefault: jest.fn() });
        
        expect(API.auth.register).toHaveBeenCalledWith('user2', 'pass2');
        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('sarv_token', 'def');
    });

    it('handles logout', () => {
        Auth.logout();
        expect(mockSessionStorage.removeItem).toHaveBeenCalledWith('sarv_token');
        expect(WsClient.disconnect).toHaveBeenCalled();
        expect(document.getElementById('auth-overlay').classList.contains('hidden')).toBe(false);
    });

    it('extracts oidc_token from URL', async () => {
        const OriginalURLSearchParams = global.URLSearchParams;
        global.URLSearchParams = jest.fn(() => ({
            has: (key) => key === 'oidc_token',
            get: (key) => key === 'oidc_token' ? 'sso_abc' : null
        }));

        await Auth.init();
        expect(mockSessionStorage.setItem).toHaveBeenCalledWith('sarv_token', 'sso_abc');
        expect(window.history.replaceState).toHaveBeenCalled();

        global.URLSearchParams = OriginalURLSearchParams;
    });
});
