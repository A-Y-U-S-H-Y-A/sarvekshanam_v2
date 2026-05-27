const { test, expect } = require('@playwright/test');
const { mockAllAPIs, loginAndGoto } = require('./helpers');

test.describe('AI Chat', () => {
  test.beforeEach(async ({ page }) => {
    await mockAllAPIs(page);

    // Mock the SSE streaming chat endpoint
    await page.route('**/api/ai/chat', async route => {
      // Simulate an SSE streaming response
      const encoder = new TextEncoder();
      const chunks = [
        'data: {"chunk":"Hello"}\n\n',
        'data: {"chunk":" from"}\n\n',
        'data: {"chunk":" AI"}\n\n',
        'data: [DONE]\n\n',
      ];
      const body = chunks.join('');
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: body,
      });
    });
  });

  test('switch to AI tab, select provider, type message, see response', async ({ page }) => {
    await loginAndGoto(page);

    // Switch to AI tab
    await page.click('#tab-ai');
    await expect(page.locator('#panel-ai')).toHaveClass(/active/);

    // Verify provider loaded
    await expect(page.locator('#ai-provider')).toContainText('MockAI');
    await expect(page.locator('#ai-model')).toContainText('mock-7b');

    // Verify RAG stats loaded
    await expect(page.locator('#rag-doc-count')).toContainText('5');

    // Type a message
    await page.fill('#chat-input', 'Explain the scan results');

    // Click send
    await page.click('#chat-send');

    // User message should appear in chat
    await expect(page.locator('#chat-messages')).toContainText('Explain the scan results');

    // Welcome message should be gone
    await expect(page.locator('.chat-welcome')).toHaveCount(0);
  });

  test('attach session shows context indicator', async ({ page }) => {
    await loginAndGoto(page);

    // First run a scan in Power User to create a session
    await page.click('text=Nmap');
    await page.fill('#param-target', '10.0.0.1');
    await page.click('button:has-text("Run Scan")');

    // Switch to AI tab
    await page.click('#tab-ai');

    // Click attach button
    await page.click('button:has-text("Attach")');

    // Context indicator should update
    await expect(page.locator('#ai-context-indicator')).toContainText('session(s) attached');
  });
});
