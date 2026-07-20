const { test, expect } = require('@playwright/test');

test.describe('Queue WebSocket Status', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth and other APIs to load the page
    await page.route('**/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { username: 'testuser', role: 'admin' } } }) });
    });
    await page.route('**/auth/oidc/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
    });
    await page.route('**/api/modules', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: {} } }) });
    });
    await page.route('**/api/runners', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/groups', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/appointments', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { appointments: [], total: 0 } }) });
    });
  });

  test('queue badge updates correctly based on WS events', async ({ page }) => {
    // Route WebSocket
    await page.routeWebSocket('**/ws', ws => {
      ws.onMessage(message => {
        // Echo or handle client messages if necessary
      });
      
      // We expose a function to the page to trigger server messages
      page.exposeFunction('triggerServerQueueUpdate', (position) => {
        ws.send(JSON.stringify({
          type: 'QUEUE_UPDATE',
          data: {
            sessionId: 'test-sess',
            position: position,
            estimatedWaitMs: position * 5000
          }
        }));
      });
    });

    // Navigate to app
    await page.goto('/');
    await page.evaluate(() => sessionStorage.setItem('sarv_token', 'test-token'));
    await page.reload();

    // Wait for app to load
    await expect(page.locator('#app')).toBeVisible();

    // The queue badge should be initially hidden
    const badge = page.locator('#queue-depth-badge');
    const label = page.locator('#queue-depth-label');
    await expect(badge).toHaveClass(/hidden/);

    // Simulate WebSocket message: QUEUE_UPDATE position 1
    await page.evaluate(() => window.triggerServerQueueUpdate(1));

    // The badge should become visible and say "1 queued (~5s)"
    await expect(badge).not.toHaveClass(/hidden/);
    await expect(label).toContainText('1 queued');

    // Simulate WebSocket message: QUEUE_UPDATE position 0 (Dequeue)
    await page.evaluate(() => window.triggerServerQueueUpdate(0));

    // The badge should hide
    await expect(badge).toHaveClass(/hidden/);
  });
});
