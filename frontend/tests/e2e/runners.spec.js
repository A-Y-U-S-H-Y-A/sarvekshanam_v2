const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('Runners', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test('view runners and add a new runner', async ({ page }) => {
    await loginAndGoto(page);

    // Switch to Runners tab
    await page.click('#tab-runners');
    await expect(page.locator('#panel-runners')).toHaveClass(/active/);

    // Should see existing runner
    await expect(page.locator('#runners-list')).toContainText('Runner1');
    await expect(page.locator('#runners-list')).toContainText('online');

    // Open Add Runner modal
    await page.click('button:has-text("Add Runner")');
    await expect(page.locator('#add-runner-modal')).not.toHaveClass(/hidden/);

    // Fill form
    await page.fill('#runner-name-input', 'Edge Node US');
    await page.fill('#runner-url-input', 'http://192.168.1.50:8080');
    // Submit
    await page.click('#add-runner-form button[type="submit"]');

    // Modal should close
    await expect(page.locator('#add-runner-modal')).toHaveClass(/hidden/);
  });
});
