let mockResponses = {};

global.fetch = jest.fn((url, options) => {
    let path = url;
    if (typeof url === 'string' && url.startsWith('http')) {
        try {
            path = new URL(url).pathname;
        } catch (e) {
            // keep original if invalid URL
        }
    }
    
    const method = options?.method || 'GET';
    const key = `${method} ${path}`;
    
    if (mockResponses[key]) {
        const res = mockResponses[key];
        return Promise.resolve({
            ok: res.ok !== undefined ? res.ok : true,
            status: res.status || 200,
            json: () => Promise.resolve(res.body)
        });
    }

    if (mockResponses[path]) {
        const res = mockResponses[path];
        return Promise.resolve({
            ok: res.ok !== undefined ? res.ok : true,
            status: res.status || 200,
            json: () => Promise.resolve(res.body)
        });
    }

    // Default response
    return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({})
    });
});

const setMockResponse = (pathOrKey, body, status = 200, ok = true) => {
    mockResponses[pathOrKey] = { body, status, ok };
};

const clearMockResponses = () => {
    mockResponses = {};
    global.fetch.mockClear();
};

module.exports = {
    setMockResponse,
    clearMockResponses
};
