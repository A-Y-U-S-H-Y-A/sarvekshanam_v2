const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('Bulk Scan', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test('enter targets, check modules, start bulk scan, see progress', async ({ page }) => {
    await loginAndGoto(page);

    // Switch to Bulk Scan tab
    await page.click('#tab-bulk');
    await expect(page.locator('#panel-bulk')).toHaveClass(/active/);

    // Enter targets
    await page.fill('#bulk-targets', '1.1.1.1\n2.2.2.2\n3.3.3.3');

    // Check a module
    await page.evaluate(() => document.getElementById('bulk-mod-nmap').click());

    // Badge should update
    await expect(page.locator('#bulk-count-badge')).toContainText('3 targets');
    await expect(page.locator('#bulk-count-badge')).toContainText('1 module');

    // Start bulk scan
    await page.click('button:has-text("Start Bulk Scan")');

    // Progress list should show the session
    await expect(page.locator('#bulk-progress-list')).toContainText('1.1.1.1');
  });
});
