const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('Commands', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test('submit command and see pending status', async ({ page }) => {
    await loginAndGoto(page);

    // Switch to Commands tab
    await page.click('#tab-cmd');
    await expect(page.locator('#panel-cmd')).toHaveClass(/active/);

    // Should see existing command in list
    await expect(page.locator('#cmd-list')).toContainText('whoami');
    await expect(page.locator('#cmd-list')).toContainText('pending');

    // Submit a new command
    await page.fill('#cmd-input', 'nmap -sV 10.0.0.1');
    await page.selectOption('#cmd-runner', 'r1', { force: true });
    await page.click('#panel-cmd button:has-text("Submit")');

    // Wait for toast to confirm submission
    await expect(page.locator('#toast')).toContainText('awaiting approval');

    // Input should be cleared after submit
    await expect(page.locator('#cmd-input')).toHaveValue('');
  });
});
