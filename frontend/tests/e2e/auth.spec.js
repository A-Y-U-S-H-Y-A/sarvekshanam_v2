const { test, expect } = require('@playwright/test');

test.describe('Authentication', () => {
  test.beforeEach(async ({ page }) => {
    // Mock all API routes
    await page.route('**/auth/login', async route => {
      const body = JSON.parse(route.request().postData());
      if (body.username === 'admin' && body.password === 'admin') {
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { token: 'mock-token', user: { username: 'admin', role: 'admin' } } }) });
      } else {
        await route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ success: false, error: { message: 'Invalid credentials' } }) });
      }
    });

    await page.route('**/auth/register', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { token: 'mock-token', user: { username: 'newuser', role: 'user' } } }) });
    });

    await page.route('**/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { username: 'admin', role: 'admin' } } }) });
    });

    await page.route('**/auth/oidc/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
    });

    // Mock remaining API endpoints to prevent errors during boot
    await page.route('**/api/modules', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: {} } }) });
    });
    await page.route('**/api/runners', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/groups', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/scans**', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { sessions: [] } }) });
    });
    await page.route('**/api/ai/providers', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { providers: [] } }) });
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

  test('successful login hides overlay', async ({ page }) => {
    await page.goto('/');

    // Ensure overlay is visible
    await expect(page.locator('#auth-overlay')).toBeVisible();

    await page.fill('#auth-username', 'admin');
    await page.fill('#auth-password', 'admin');
    await page.click('#auth-submit');

    // Overlay should hide after successful login
    await expect(page.locator('#auth-overlay')).toBeHidden();

    // Check if token is in localStorage
    const token = await page.evaluate(() => localStorage.getItem('sarv_token'));
    expect(token).toBe('mock-token');
  });

  test('failed login shows error', async ({ page }) => {
    await page.goto('/');

    await page.fill('#auth-username', 'wrong');
    await page.fill('#auth-password', 'wrong');
    await page.click('#auth-submit');

    // Overlay remains visible
    await expect(page.locator('#auth-overlay')).toBeVisible();

    // Error message should show
    await expect(page.locator('#auth-error')).toBeVisible();
    await expect(page.locator('#auth-error')).toContainText('Invalid credentials');
  });

  test('SSO callback processes token from URL', async ({ page }) => {
    await page.goto('/?oidc_token=sso-mock-token');

    // Auth.init() should extract the token and call API.auth.me() which is mocked
    // Overlay should hide because token is found and /auth/me succeeds
    await expect(page.locator('#auth-overlay')).toBeHidden();

    // Token should be in localStorage
    const token = await page.evaluate(() => localStorage.getItem('sarv_token'));
    expect(token).toBe('sso-mock-token');
  });
});
