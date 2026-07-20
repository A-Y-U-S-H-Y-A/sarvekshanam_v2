const { test, expect } = require('@playwright/test');

/**
 * Shared API mock setup for all E2E tests that need a logged-in session.
 * Intercepts all backend endpoints with valid { success: true, data: ... } responses.
 */
async function mockAllAPIs(page) {
  // Auth
  await page.route('**/auth/me', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { username: 'admin', role: 'admin' } } }) });
  });
  await page.route('**/auth/oidc/status', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
  });

  // Modules
  await page.route('**/api/modules', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: { Network: [{ id: 'nmap', name: 'Nmap', description: 'Network scanner', category: 'Network', parameters: [{ name: 'target', type: 'text', required: true }] }] } } }) });
  });

  // Runners / Groups
  await page.route('**/api/runners', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'new-runner', name: 'TestRunner', url: 'http://test:8080', status: 'offline' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [{ id: 'r1', name: 'Runner1', status: 'online', url: 'http://r1:8080', modules: [{ name: 'nmap' }] }] }) });
    }
  });
  await page.route('**/api/runners/*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
  });
  await page.route('**/api/groups', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
  });

  // Scans
  await page.route('**/api/scans/bulk', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sessions: [{ id: 'bulk1', status: 'pending', targets: ['1.1.1.1'], moduleIds: ['nmap'], createdAt: new Date().toISOString() }] } }) });
  });
  await page.route('**/api/scans/search', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sessions: [] } }) });
  });
  await page.route('**/api/scans', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { session: { id: 'sess1', name: 'Test', status: 'pending', targets: ['192.168.1.1'], moduleIds: ['nmap'] } } }) });
    }
  });

  // AI
  await page.route('**/api/ai/providers', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { providers: [{ id: 'mock', name: 'MockAI', defaultModel: 'mock-7b', configured: true, models: ['mock-7b', 'mock-70b'] }] } }) });
  });
  await page.route('**/api/rag/stats', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { stats: { totalCount: 5 } } }) });
  });

  // Commands
  await page.route('**/api/commands?*', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { commands: [{ id: 'cmd1', command: 'whoami', status: 'pending', username: 'admin', requestedAt: new Date().toISOString() }] } }) });
  });
  await page.route('**/api/commands', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { id: 'cmd1', command: 'whoami', status: 'pending', username: 'admin' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { commands: [{ id: 'cmd1', command: 'whoami', status: 'pending', username: 'admin', requestedAt: new Date().toISOString() }] } }) });
    }
  });
  await page.route('**/api/commands/*/approve', async route => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
  });

  // Appointments
  await page.route('**/api/appointments**', async route => {
    const url = route.request().url();
    if (url.includes('/scans')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { scans: [] } }) });
      return;
    }
    if (url.includes('/chats')) {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { chats: [] } }) });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        success: true,
        data: {
          appointments: [{ id: 'appt-e2e', name: 'E2E Context', mode: 'hybrid', createdAt: new Date().toISOString() }],
          total: 1
        }
      })
    });
  });

  // Settings
  await page.route('**/api/settings/proxy', async route => {
    if (route.request().method() === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { mode: 'none', target: '' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: {} }) });
    }
  });

  // API Keys
  await page.route('**/api/keys', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { key: 'sk_test_abc123', name: 'test-key' } }) });
    } else {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    }
  });
}

/** Navigate to app with a pre-seeded token so we start logged in */
async function loginAndGoto(page, path = '/') {
  await page.goto(path);
  await page.evaluate(() => sessionStorage.setItem('sarv_token', 'e2e-token'));
  await page.reload();
  await expect(page.locator('#auth-overlay')).toBeHidden();
}

module.exports = { mockAllAPIs, loginAndGoto };
