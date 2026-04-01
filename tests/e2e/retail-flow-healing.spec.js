/**
 * @fileoverview Complete E2E flow for the Retail Application with Self-Healing.
 * 
 * This test demonstrates the framework's ability to heal broken selectors
 * across the entire shopping journey: Login -> Dashboard -> Products -> Cart -> Checkout.
 * 
 * URL: https://retail-website-two.vercel.app/app/dashboard
 * Credentials: test@demo.com / password123
 * 
 * Run: npx playwright test tests/e2e/retail-flow-healing.spec.js
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

const TARGET_URL = 'https://retail-website-two.vercel.app/app/dashboard';
const VALID_USER = { email: 'test@demo.com', password: 'password123' };

// Real selectors identified during exploration
const REAL_SEL = {
  emailInput: 'input[type="email"]',
  passwordInput: 'input[type="password"]',
  signInButton: 'button.rw-btn-primary:has-text("Sign in")',
  productsLink: 'a[href="/app/products"]',
  addToCartBtn: 'button.rw-btn-primary:has-text("Add to cart"):not([disabled]) >> nth=0', // First enabled add to cart button
  cartLink: 'a[href="/app/cart"]',
  checkoutBtn: 'button.rw-btn-primary:has-text("Checkout")',
  payButton: 'button.rw-btn-primary:has-text("Pay")',
};

test.describe('Retail Website - Complete Flow with Self-Healing', () => {

  // ─────────────────────────────────────────────────────────────────────────
  //  BASELINE: Correct selectors – proves the flow works end-to-end
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline: Complete Flow (correct selectors)', async ({ page }) => {
    test.setTimeout(120000);

    const orchestrator = new TestOrchestrator(page, 'retail-flow-baseline', {
      healingEnabled: false,
    });

    try {
      // 1. Navigate to Dashboard (will redirect to login)
      console.log('[Baseline] Step 1: Navigating to dashboard (redirects to login)...');
      await orchestrator.goto(TARGET_URL);

      // 2. Login
      console.log('[Baseline] Step 2: Logging in...');
      await orchestrator.fill(REAL_SEL.emailInput, VALID_USER.email, {
        description: 'Email address input field',
      });
      await orchestrator.fill(REAL_SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });
      await orchestrator.click(REAL_SEL.signInButton, {
        description: 'Sign in button',
      });
      await orchestrator.waitForURL(/\/dashboard/);

      // 3. Navigate to Products
      console.log('[Baseline] Step 3: Navigating to Products...');
      await orchestrator.click(REAL_SEL.productsLink, {
        description: 'Products navigation link in sidebar',
      });
      await orchestrator.waitForURL(/\/products/);

      // 4. Add item to cart
      console.log('[Baseline] Step 4: Adding product to cart...');
      await orchestrator.click(REAL_SEL.addToCartBtn, {
        description: 'Add to cart button for the first product',
      });

      // 5. Navigate to Cart
      console.log('[Baseline] Step 5: Navigating to Cart...');
      await orchestrator.click(REAL_SEL.cartLink, {
        description: 'Cart navigation link in sidebar',
      });
      await orchestrator.waitForURL(/\/cart/);

      // 6. Proceed to Checkout
      console.log('[Baseline] Step 6: Clicking Checkout...');
      await orchestrator.click(REAL_SEL.checkoutBtn, {
        description: 'Checkout button on cart page',
      });
      await orchestrator.waitForURL(/\/checkout/);

      // 7. Place Order (Pay)
      console.log('[Baseline] Step 7: Clicking Pay button...');
      await orchestrator.click(REAL_SEL.payButton, {
        description: 'Pay button to complete order',
      });

      console.log('✅ Baseline passed: Complete flow works with correct selectors.');

    } catch (error) {
      console.error('❌ Baseline test failed:', error.message);
      throw error;
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  SELF-HEALING: Broken selectors – AI recovers the flow
  // ─────────────────────────────────────────────────────────────────────────
  test('🔧 Self-Healing: Complete Flow (intentionally broken selectors)', async ({ page }) => {
    // Large timeout for AI recovery steps
    test.setTimeout(300000);

    const orchestrator = new TestOrchestrator(page, 'retail-flow-heal');

    try {
      // 1. Navigate to Dashboard
      console.log('Step 1: Navigating to dashboard...');
      await orchestrator.goto(TARGET_URL);

      // 2. Login (BROKEN EMAIL SELECTOR)
      console.log('Step 2: Logging in (simulating broken email selector)...');
      await orchestrator.fill('#user-login-email-v2-broken', VALID_USER.email, {
        description: 'Email address input field',
      });
      await orchestrator.fill(REAL_SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });
      await orchestrator.click(REAL_SEL.signInButton, {
        description: 'Sign in button',
      });

      // 3. Navigate to Products (BROKEN LINK SELECTOR)
      console.log('Step 3: Navigating to Products (simulating broken link selector)...');
      await orchestrator.click('a.nav-link-products-v2', {
        description: 'Products navigation link in sidebar',
      });
      await orchestrator.waitForURL(/\/products/);

      // 4. Add item to cart (BROKEN ADD TO CART SELECTOR)
      console.log('Step 4: Adding product to cart (simulating broken button selector)...');
      await orchestrator.click('button.add-to-cart-action-btn-broken', {
        description: 'Add to cart button for the first product',
      });

      // 5. Navigate to Cart
      console.log('Step 5: Navigating to Cart...');
      await orchestrator.click(REAL_SEL.cartLink, {
        description: 'Cart navigation link in sidebar',
      });
      await orchestrator.waitForURL(/\/cart/);

      // 6. Proceed to Checkout (BROKEN CHECKOUT SELECTOR)
      console.log('Step 6: Clicking Checkout (simulating broken checkout selector)...');
      await orchestrator.click('button.proceed-to-checkout-v3', {
        description: 'Checkout button on cart page',
      });
      await orchestrator.waitForURL(/\/checkout/);

      // 7. Place Order (Pay)
      console.log('Step 7: Clicking Pay button...');
      await orchestrator.click(REAL_SEL.payButton, {
        description: 'Pay button to complete order',
      });

      console.log('✅ Success: Complete flow passed with self-healing!');

    } catch (error) {
      console.error('❌ Test failed:', error.message);
      throw error;
    } finally {
      await orchestrator.finalize();
    }
  });

});
