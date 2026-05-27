const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('Responsive Layout', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);
  });

  test('mobile viewport (768px) shows compact navigation', async ({ page }) => {
    await page.setViewportSize({ width: 768, height: 1024 });
    await loginAndGoto(page);

    // App should still be visible
    await expect(page.locator('#app')).toBeVisible();

    // Nav bar should be visible
    await expect(page.locator('nav')).toBeVisible();

    // Nav tabs should still be present (scrollable)
    await expect(page.locator('#tab-power')).toBeVisible();

    // Auth left panel should be hidden on mobile (CSS media query)
    // Already handled by the auth overlay being hidden after login
  });

  test('desktop viewport (1440px) shows full layout', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await loginAndGoto(page);

    // App visible
    await expect(page.locator('#app')).toBeVisible();

    // All nav tabs visible
    await expect(page.locator('#tab-power')).toBeVisible();
    await expect(page.locator('#tab-ai')).toBeVisible();
    await expect(page.locator('#tab-bulk')).toBeVisible();
    await expect(page.locator('#tab-runners')).toBeVisible();
    await expect(page.locator('#tab-cmd')).toBeVisible();

    // Power User sidebar should be visible at full width
    const sidebar = page.locator('#panel-power aside');
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(200);
  });

  test('resize from mobile to desktop maintains layout', async ({ page }) => {
    // Start mobile
    await page.setViewportSize({ width: 375, height: 812 });
    await loginAndGoto(page);

    await expect(page.locator('#app')).toBeVisible();
    await expect(page.locator('#tab-power')).toBeVisible();

    // Resize to desktop
    await page.setViewportSize({ width: 1440, height: 900 });

    // Wait for layout to settle
    await page.waitForTimeout(500);

    // All tabs should be visible
    await expect(page.locator('#tab-ai')).toBeVisible();
    await expect(page.locator('#tab-bulk')).toBeVisible();

    // Sidebar should have proper width
    const sidebar = page.locator('#panel-power aside');
    await expect(sidebar).toBeVisible();
    const box = await sidebar.boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(200);
  });
});
