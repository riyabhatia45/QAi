/**
 * @fileoverview Complete E2E flow from Login to Add to Cart with Self-Healing.
 *
 * This test demonstrates the framework's ability to heal broken selectors
 * across a multi-step purchase flow on the live Swag Labs application.
 *
 * Flow:
 *  1. Navigate to Login Page
 *  2. Fill Email (using broken selector)
 *  3. Fill Password
 *  4. Click Login button
 *  5. Wait for Inventory/Product page
 *  6. Click "Add to Cart" on the first product (using broken selector)
 *  7. Verify button text changes to "Remove" (confirming it was tappable)
 *
 * Run: npx playwright test tests/e2e/add-to-cart-healing.spec.js
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

const TARGET_URL = 'https://swag-testing.vercel.app/';
const VALID_USER = { email: 'john@mail.com', password: 'changeme' };

// Real selectors (for reference, but we will use broken ones in tests)
const REAL_SEL = {
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  loginButton: 'button:has-text("Login")',
  addToCartBtn: 'button:has-text("Add to cart") >> nth=0',
};

test.describe('Swag Labs - Complete E2E Flow with Self-Healing', () => {

  // ─────────────────────────────────────────────────────────────────────────
  //  BASELINE: Correct selectors – proves the flow works end-to-end
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline: Login → Add to Cart (correct selectors)', async ({ page }) => {
    test.setTimeout(60000);

    const orchestrator = new TestOrchestrator(page, 'e2e-add-to-cart-baseline');

    try {
      // 1. Navigate to Login
      console.log('[Baseline] Step 1: Navigating to login page...');
      await orchestrator.goto(TARGET_URL);

      // 2. Fill Email (CORRECT SELECTOR)
      console.log('[Baseline] Step 2: Filling email...');
      await orchestrator.fill(REAL_SEL.emailInput, VALID_USER.email, {
        description: 'Email address input field',
      });

      // 3. Fill Password (CORRECT SELECTOR)
      console.log('[Baseline] Step 3: Filling password...');
      await orchestrator.fill(REAL_SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });

      // 4. Click Login (CORRECT SELECTOR)
      console.log('[Baseline] Step 4: Clicking login...');
      await orchestrator.click(REAL_SEL.loginButton, {
        description: 'Login submit button',
      });

      // 5. Verify Redirect to Inventory
      console.log('[Baseline] Step 5: Waiting for inventory page...');
      await orchestrator.waitForURL(/\/inventory/, { timeout: 15000 });
      expect(page.url()).toContain('/inventory');

      // 6. Add first item to cart (CORRECT SELECTOR)
      console.log('[Baseline] Step 6: Adding item to cart...');
      await orchestrator.click(REAL_SEL.addToCartBtn, {
        description: 'The "Add to cart" button for a product in the catalog',
      });

      // 7. Verify the button is now "Remove"
      console.log('[Baseline] Step 7: Verifying button state change...');
      const removeButton = page.locator('button:has-text("Remove")').first();
      await removeButton.waitFor({ state: 'visible', timeout: 5000 });
      const buttonText = await removeButton.textContent();
      expect(buttonText).toBe('Remove');

      console.log('✅ Baseline passed: Complete E2E flow works with correct selectors.');

    } catch (error) {
      console.error('❌ Baseline test failed:', error.message);
      throw error;
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  SELF-HEALING: Broken selectors – the AI framework detects & recovers
  // ─────────────────────────────────────────────────────────────────────────
  test('🔧 Self-Healing: Login → Add to Cart (broken selectors)', async ({ page }) => {
    // Extend timeout for AI processing/retries
    test.setTimeout(300000);

    const orchestrator = new TestOrchestrator(page, 'e2e-add-to-cart-heal');

    try {
      // 1. Navigate to Login
      console.log('Step 1: Navigating to login page...');
      await orchestrator.goto(TARGET_URL);

      // 2. Fill Email (BROKEN SELECTOR)
      console.log('Step 2: Filling email (simulating broken selector)...');
      await orchestrator.fill('#user-login-email-field-v2', VALID_USER.email, {
        description: 'Email address input field',
      });

      // 3. Fill Password (REAL SELECTOR)
      console.log('Step 3: Filling password...');
      await orchestrator.fill(REAL_SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });

      // 4. Click Login (REAL SELECTOR)
      console.log('Step 4: Clicking login...');
      await orchestrator.click(REAL_SEL.loginButton, {
        description: 'Login submit button',
      });

      // 5. Verify Redirect to Inventory
      console.log('Step 5: Waiting for inventory page...');
      await orchestrator.waitForURL(/\/inventory/, { timeout: 15000 });
      expect(page.url()).toContain('/inventory');

      // 6. Add first item to cart (BROKEN SELECTOR)
      // The real selector is button:has-text("Add to cart")
      console.log('Step 6: Adding item to cart (simulating broken selector)...');
      await orchestrator.click('button.custom-add-to-cart-action', {
        description: 'The "Add to cart" button for a product in the catalog',
      });

      // 7. Verify the button is now "Remove"
      // This proves the "Add to cart" button was successfully located and tapped.
      console.log('Step 7: Verifying button state change...');
      const removeButton = page.locator('button:has-text("Remove")').first();
      await removeButton.waitFor({ state: 'visible', timeout: 5000 });
      
      const buttonText = await removeButton.textContent();
      expect(buttonText).toBe('Remove');

      console.log('✅ Success: Complete E2E flow from login to add-to-cart passed with self-healing!');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    } finally {
      await orchestrator.finalize();
    }
  });

});
