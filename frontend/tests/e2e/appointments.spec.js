const { test, expect } = require('@playwright/test');

test.describe('Appointments Module E2E', () => {
  test.beforeEach(async ({ page }) => {
    // Mock auth
    await page.route('**/auth/me', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { user: { username: 'testuser', role: 'admin' } } }) });
    });
    await page.route('**/auth/oidc/status', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { enabled: false } }) });
    });

    // Mock initial appointments list
    await page.route('**/api/appointments', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              appointments: [
                { id: 'appt-1', name: 'Existing Session', mode: 'manual', createdAt: new Date().toISOString() }
              ],
              total: 1
            }
          })
        });
      } else if (route.request().method() === 'POST') {
        // Mock appointment creation
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            success: true,
            data: {
              appointment: { id: 'appt-2', name: 'New E2E Session', mode: 'manual', createdAt: new Date().toISOString() }
            }
          })
        });
      }
    });

    // Mock scans and chats for viewDetail
    await page.route('**/api/appointments/*/scans', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            scans: [
              { id: 'scan-1', name: 'E2E Scan', status: 'completed', createdAt: new Date().toISOString() }
            ]
          }
        })
      });
    });

    await page.route('**/api/appointments/*/chats', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          success: true,
          data: {
            chats: [
              { id: 'chat-1', provider: 'Mock', model: 'MockModel', createdAt: new Date().toISOString() }
            ]
          }
        })
      });
    });

    // Other required mocks
    await page.route('**/api/modules', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: { categories: {} } }) });
    });
    await page.route('**/api/runners', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
    await page.route('**/api/groups', async route => {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, data: [] }) });
    });
  });

  test('create appointment and view details', async ({ page }) => {
    // Navigate to app
    await page.goto('/');
    await page.evaluate(() => localStorage.setItem('sarv_token', 'test-token'));
    await page.reload();

    // Wait for app to load
    await expect(page.locator('#app')).toBeVisible();

    // Switch to appointments tab (if not already active or if visible)
    await page.click('#tab-appointments');
    await expect(page.locator('#panel-appointments')).toHaveClass(/active/);

    // Click "New Appointment"
    await page.click('button:has-text("+ New Appointment")');
    await expect(page.locator('#new-appointment-modal')).toBeVisible();

    // Fill form and submit
    await page.fill('#appt-name-input', 'New E2E Session');
    
    // We need to route the GET again to include the new appointment so the UI updates
    await page.route('**/api/appointments', async route => {
        if (route.request().method() === 'GET') {
          await route.fulfill({
            status: 200,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                appointments: [
                  { id: 'appt-2', name: 'New E2E Session', mode: 'manual', createdAt: new Date().toISOString() },
                  { id: 'appt-1', name: 'Existing Session', mode: 'manual', createdAt: new Date(Date.now() - 10000).toISOString() }
                ],
                total: 2
              }
            })
          });
        } else if (route.request().method() === 'POST') {
          await route.fulfill({
            status: 201,
            contentType: 'application/json',
            body: JSON.stringify({
              success: true,
              data: {
                appointment: { id: 'appt-2', name: 'New E2E Session', mode: 'manual', createdAt: new Date().toISOString() }
              }
            })
          });
        }
    });

    await page.click('#new-appointment-form button[type="submit"]');

    // Modal should close
    await expect(page.locator('#new-appointment-modal')).toBeHidden();

    // The new appointment should be in the list
    await expect(page.locator('#appointments-list')).toContainText('New E2E Session');

    // The active context badge should update
    await expect(page.locator('#active-appointment-badge-label')).toContainText('New E2E Session');

    // Click "View" on the existing session
    // We use a CSS selector to find the button inside the card for "Existing Session"
    // Using XPath or robust locator:
    const existingSessionCard = page.locator('.appointment-card', { hasText: 'Existing Session' });
    await existingSessionCard.locator('button:has-text("View")').click();

    // The detail panel should become visible
    const detailPanel = page.locator('#appointment-detail');
    await expect(detailPanel).toBeVisible();
    await expect(page.locator('#appt-detail-title')).toContainText('Existing Session');

    // Scans and chats should render without crashing
    await expect(page.locator('#appt-scans-list')).toContainText('E2E Scan');
    await expect(page.locator('#appt-chats-list')).toContainText('Mock');
    await expect(page.locator('#appt-chats-list')).toContainText('MockModel');
  });
});
