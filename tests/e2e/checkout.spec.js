/**
 * @fileoverview Checkout E2E Test with Agentic Self-Healing.
 *
 * Demonstrates both selector recovery and flow recovery
 * (e.g. dismissing an unexpected modal) on a sample checkout flow.
 *
 * Run: npm run test:checkout
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

test.describe('Checkout Flow – Self-Healing', () => {

  test('should complete checkout with resilient selectors', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'checkout-001');

    try {
      // Step 1: Visit the storefront
      await orchestrator.goto('https://demo.opencart.com/', {
        description: 'Navigate to OpenCart demo storefront',
      });

      // Step 2: Assert we're on the homepage
      await orchestrator.assertState({
        state: 'OpenCart storefront homepage',
        title: 'Your Store',
      });

      // Step 3: Click a product (MacBook for example)
      await orchestrator.click('a[href*="product/product"][href*="43"]', {
        description: 'MacBook product link on homepage',
      });

      // Step 4: Click "Add to Cart"
      await orchestrator.click('#button-cart', {
        description: 'Add to Cart button on product page',
      });

      // Step 5: Go to cart
      await orchestrator.click('a[title="Shopping Cart"]', {
        description: 'Shopping Cart link in navigation',
      });

      // Step 6: Verify cart page
      await orchestrator.assertState({
        state: 'Shopping cart page with items',
        title: 'Shopping Cart',
      });

      console.log('✅ Checkout flow test passed successfully');
    } finally {
      await orchestrator.finalize();
    }
  });

  test('should heal when product page selector changes', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'checkout-002-heal');

    try {
      await orchestrator.goto('https://demo.opencart.com/');

      // Use an intentionally wrong selector to trigger healing
      await orchestrator.click('[data-testid="featured-product-macbook"]', {
        description: 'Featured MacBook product link',
      });

      // If healing worked, we should be on a product page
      await orchestrator.assertState({
        state: 'Product detail page',
        url: 'product',
      });

      console.log('✅ Product selector healing test passed');
    } finally {
      await orchestrator.finalize();
    }
  });
});
