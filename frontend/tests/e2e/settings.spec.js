const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('Settings', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test('open settings, change proxy mode, save', async ({ page }) => {
    await loginAndGoto(page);

    // Click Settings button
    await page.click('#btn-settings');
    await expect(page.locator('#settings-modal')).not.toHaveClass(/hidden/);

    // Should show current proxy mode
    const proxyMode = await page.inputValue('#setting-proxy-mode');
    expect(proxyMode).toBe('none');

    // Change proxy mode to hop
    await page.selectOption('#setting-proxy-mode', 'hop');

    // Proxy target input should appear
    await expect(page.locator('#proxy-target-group')).toBeVisible();

    // Fill proxy target
    await page.fill('#setting-proxy-target', 'http://192.168.1.10:8080');

    // Save
    await page.click('button:has-text("Save Settings")');

    // Modal should close
    await expect(page.locator('#settings-modal')).toHaveClass(/hidden/);
  });
});
