/**
 * @fileoverview Login E2E Test with Agentic Self-Healing.
 *
 * Uses the TestOrchestrator to demonstrate self-healing selectors
 * on the Playwright demo "todo" app (always accessible, no bot protection).
 *
 * Run: npm run test:login
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

test.describe('Playwright Demo – Self-Healing Tests', () => {

  test('should navigate and interact with correct selectors', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'demo-001');

    try {
      // Step 1: Navigate to the Playwright demo todo app
      await orchestrator.goto('https://demo.playwright.dev/todomvc/#/', {
        description: 'Navigate to TodoMVC demo app',
      });

      // Step 2: Fill the todo input with correct selector
      await orchestrator.fill('.new-todo', 'Buy groceries', {
        description: 'New todo text input field',
      });

      // Step 3: Press Enter to add the todo (use page directly for keyboard)
      await page.keyboard.press('Enter');

      // Step 4: Assert the todo item is visible
      await orchestrator.assertVisible('.todo-list li', {
        description: 'First todo item in the list',
      });

      // Step 5: Add another todo
      await orchestrator.fill('.new-todo', 'Walk the dog', {
        description: 'New todo text input field',
      });
      await page.keyboard.press('Enter');

      // Step 6: Verify count
      await orchestrator.assertVisible('.todo-count', {
        description: 'Todo count footer showing items left',
      });

      console.log('✅ Demo test with correct selectors passed successfully');
    } finally {
      await orchestrator.finalize();
    }
  });

  test('should heal when todo input selector is wrong', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'demo-002-heal');

    try {
      // Step 1: Navigate
      await orchestrator.goto('https://demo.playwright.dev/todomvc/#/');

      // Step 2: Use an INTENTIONALLY WRONG selector to trigger healing
      // The real selector is ".new-todo" but we use a fake one
      await orchestrator.fill('[data-testid="todo-input-v2"]', 'Test healing', {
        description: 'New todo text input field',
      });

      await page.keyboard.press('Enter');

      // Step 3: Verify the todo was added (proves healing worked)
      await orchestrator.assertVisible('.todo-list li', {
        description: 'Todo item appeared after healed fill action',
      });

      console.log('✅ Self-healing todo input test passed!');
    } finally {
      await orchestrator.finalize();
    }
  });

  test('should heal when toggle-all selector changes', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'demo-003-heal');

    try {
      // Add some todos first
      await orchestrator.goto('https://demo.playwright.dev/todomvc/#/');
      await orchestrator.fill('.new-todo', 'Item 1', { description: 'Todo input' });
      await page.keyboard.press('Enter');
      await orchestrator.fill('.new-todo', 'Item 2', { description: 'Todo input' });
      await page.keyboard.press('Enter');

      // Use a WRONG selector for the todo item checkbox
      // The real selector is something like ".todo-list li .toggle"
      await orchestrator.click('[data-testid="todo-checkbox-1"]', {
        description: 'Checkbox to mark first todo as complete',
      });

      console.log('✅ Self-healing checkbox test passed!');
    } finally {
      await orchestrator.finalize();
    }
  });
});
