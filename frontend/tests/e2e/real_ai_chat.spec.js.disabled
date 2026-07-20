const { test, expect } = require('@playwright/test');

test.describe('Real AI Chat Features', () => {
  test.beforeEach(async ({ page }) => {
    // Login
    await page.goto('http://localhost:3000');
    // Assuming there's a login form if not authenticated
    if (await page.isVisible('#auth-username')) {
      await page.fill('#auth-username', 'admin');
      await page.fill('#auth-password', 'admin123');
      await page.click('#auth-submit');
    }
    await page.waitForSelector('#app:not(.hidden)', { timeout: 10000 });
  });

  test('Test all AI Chat features', async ({ page }) => {
    test.setTimeout(120000); // 2 minutes for AI responses

    // 1. Create a new active appointment
    await page.click('#tab-appointments');
    await page.click('button:has-text("+ New Appointment")');
    await page.fill('#appt-name-input', 'AI Test Appointment');
    await page.click('button:has-text("Create Context")');
    // The appointment is automatically set as active upon creation.
    
    // 2. Go to AI Chat
    await page.click('#tab-ai');
    await expect(page.locator('#panel-ai')).toHaveClass(/active/);

    // Ensure provider and model are set
    await page.selectOption('#ai-provider', 'groq');
    await page.waitForTimeout(500); // let models update
    await page.selectOption('#ai-model', 'llama-3.3-70b-versatile');

    // 3. Simple text message
    await page.fill('#chat-input', 'Hello AI, say "TEST_PASSED"');
    await page.click('#chat-send');
    
    // Wait for the streaming to finish (class 'streaming' goes away)
    await page.waitForSelector('.chat-bubble.assistant:not(.streaming)', { timeout: 30000 });
    const reply1 = await page.innerText('#chat-messages');
    console.log('Reply 1:', reply1);
    expect(reply1).toContain('TEST_PASSED');

    // 4. Chat chaining and Tool UI Rendering
    await page.fill('#chat-input', 'First, call list_available_scans to discover scans. Then, run the nmap port scan on 127.0.0.1');
    await page.click('#chat-send');

    // Wait for the confirmation modal to appear
    await page.waitForSelector('#tool-confirm-modal:not(.hidden)', { timeout: 30000 });
    console.log('Tool confirmation modal appeared!');
    
    // Check UI rendering of the boxes
    const details = await page.innerText('#tool-confirm-details');
    console.log('Tool confirmation details:', details);
    expect(details).toContain('127.0.0.1');
    
    // Allow the tool
    await page.click('#tool-confirm-allow');

    // Wait for the scan to finish and AI to reply
    await page.waitForSelector('.chat-bubble.assistant:not(.streaming)', { timeout: 60000 });
    const reply2 = await page.innerText('.chat-bubble.assistant:last-child');
    console.log('Reply 2:', reply2);
    expect(reply2.toLowerCase()).toContain('scan');

    // 5. RAG search
    await page.fill('#rag-search-input', 'nmap');
    await page.keyboard.press('Enter');
    await page.waitForSelector('#rag-results-list .btn', { timeout: 10000 });
    await page.click('#rag-results-list .btn:first-child');
    
    // Check if input was populated
    const inputValue = await page.inputValue('#chat-input');
    expect(inputValue).toContain('Context attached');

    // 6. Rename Chat
    // Click rename chat, handle prompt
    page.once('dialog', dialog => dialog.accept('Renamed Chat AI'));
    await page.click('button[title="Rename Chat"]');
    await page.waitForTimeout(500);

    // 7. Start new chat
    await page.click('button:has-text("+ New Chat")');
    await page.waitForTimeout(500);
  });
});
