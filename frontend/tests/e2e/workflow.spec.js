const { test, expect } = require('@playwright/test');

test.describe('Main Workflow', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth endpoints
    await page.route('**/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { username: 'poweruser', role: 'admin' } } }) });
    });
    await page.route('**/auth/oidc/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
    });

    // Mock app endpoints
    await page.route('**/api/modules', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: { Network: [{ id: 'nmap', name: 'Nmap', description: 'Network scanner', category: 'Network', parameters: [{ name: 'target', type: 'text', required: true }] }] } } }) });
    });
    await page.route('**/api/runners', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/groups', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/scans/bulk', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sessions: [] } }) });
    });
    await page.route('**/api/scans/search', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sessions: [] } }) });
    });
    await page.route('**/api/scans', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { session: { id: 'test-session-123', name: 'Test Scan', status: 'pending', targets: ['192.168.1.1'], moduleIds: ['nmap'] } } }) });
      }
    });
    await page.route('**/api/scans/*', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { session: { id: 'test-session-123', name: 'Test Scan', status: 'completed' }, results: { output: 'scan data' } } }) });
    });
    await page.route('**/api/ai/providers', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { providers: [{ id: 'mock', name: 'MockProvider', defaultModel: 'mock-model', configured: true }] } }) });
    });
    await page.route('**/api/rag/stats', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { stats: { totalCount: 0 } } }) });
    });
    await page.route('**/api/commands**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { commands: [] } }) });
    });
    await page.route('**/api/appointments**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
  });

  test('complete flow: login -> power user scan -> ai chat', async ({ page }) => {
    // Seed token so we start logged in
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('sarv_token', 'workflow-token'));
    await page.reload();

    // Wait for app to load and overlay to be hidden
    await expect(page.locator('#auth-overlay')).toBeHidden();
    await expect(page.locator('#app')).toBeVisible();

    // 1. Power User tab should be active by default
    await expect(page.locator('#panel-power')).toHaveClass(/active/);

    // 2. Select Nmap module from the tree
    await page.click('text=Nmap');
    await expect(page.locator('#module-config')).not.toHaveClass(/hidden/);
    await expect(page.locator('#module-title')).toContainText('Nmap');

    // 3. Fill target and run scan
    await page.fill('#param-target', '192.168.1.1');
    await page.click('button:has-text("Run Scan")');

    // 4. Results card should appear
    await expect(page.locator('#results-card')).not.toHaveClass(/hidden/);

    // 5. Switch to AI tab
    await page.click('#tab-ai');
    await expect(page.locator('#panel-ai')).toHaveClass(/active/);

    // 6. Verify AI context indicator
    await expect(page.locator('#ai-context-indicator')).toBeVisible();
  });
});
