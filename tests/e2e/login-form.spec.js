/**
 * @fileoverview Login Form E2E Tests with Agentic Self-Healing.
 *
 * Tests the live Swag Labs site at https://swag-testing.vercel.app/
 *
 * Page structure (confirmed via live inspection):
 *   - Email input    : input[type="email"]  (placeholder: "e.g. john@mail.com")
 *   - Password input : input[type="password"] (placeholder: "Enter your password")
 *   - Login button   : button that contains text "Login"
 *   - Auto-fill btn  : button that contains text "Auto-fill demo credentials"
 *   - Empty fields   : error text "Email and password are required"
 *   - Bad creds      : error text "Unauthorized"
 *   - Post-login     : redirects to /inventory (Swag Labs product page)
 *   - Logout         : hamburger menu → "Logout" button
 *
 * Valid demo credentials:
 *   email    : john@mail.com
 *   password : changeme
 *
 * Run:  npm run test:login-form
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

// ── Live target URL ─────────────────────────────────────────────────────────
const LOGIN_PAGE = 'https://swag-testing.vercel.app/';
const INVENTORY_URL = /\/inventory/;

// ── Credentials ─────────────────────────────────────────────────────────────
const VALID_USER    = { email: 'john@mail.com', password: 'changeme' };
const INVALID_USER  = { email: 'nobody@fake.com', password: 'wrongpassword' };

// ── Real selectors (confirmed against live DOM) ──────────────────────────────
const SEL = {
  emailInput    : 'input[type="email"]',
  passwordInput : 'input[type="password"]',
  loginButton   : 'button:has-text("Login")',
  autofillButton: 'button:has-text("Auto-fill demo credentials")',
  menuButton    : 'button:has-text("☰")',
  logoutButton  : 'button:has-text("Logout")',
};

test.describe('Swag Labs Login – Self-Healing Tests', () => {

  // ═══════════════════════════════════════════════════════════════════════════
  //  BASELINE TESTS (correct selectors) – prove the flows work end-to-end
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  //  1. Successful login with valid credentials
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline 1: should log in successfully with valid credentials', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'login-form-001');

    try {
      await orchestrator.goto(LOGIN_PAGE, {
        description: 'Navigate to Swag Labs login page',
      });

      await orchestrator.fill(SEL.emailInput, VALID_USER.email, {
        description: 'Email address input field',
      });

      await orchestrator.fill(SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });

      await orchestrator.click(SEL.loginButton, {
        description: 'Login submit button',
      });

      // Wait for redirect to inventory page
      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });

      // Confirm we are on the inventory page
      const url = page.url();
      expect(url).toMatch(INVENTORY_URL);

      // Product titles are <a class="text-lg font-bold ..."> links (confirmed via live DOM)
      await page.waitForSelector('a.font-bold', { timeout: 10000 });
      const productCount = await page.locator('a.font-bold').count();
      expect(productCount).toBeGreaterThan(0);

      console.log('✅ Successful login test passed');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  2. Failed login – invalid credentials
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline 2: should show error for invalid credentials', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'login-form-002');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      await orchestrator.fill(SEL.emailInput, INVALID_USER.email, {
        description: 'Email address input field',
      });

      await orchestrator.fill(SEL.passwordInput, INVALID_USER.password, {
        description: 'Password input field',
      });

      await orchestrator.click(SEL.loginButton, {
        description: 'Login submit button',
      });

      // Error message should appear – look for any element with "Unauthorized"
      await page.waitForTimeout(2000);
      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('Unauthorized');

      // We should still be on the login page
      expect(page.url()).toMatch(/swag-testing\.vercel\.app\/?$/);

      console.log('✅ Invalid credentials error test passed');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  3. Form validation – empty fields
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline 3: should validate empty fields', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'login-form-003');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      // Click Login without filling anything
      await orchestrator.click(SEL.loginButton, {
        description: 'Login submit button',
      });

      await page.waitForTimeout(500);

      const bodyText = await page.textContent('body');
      expect(bodyText).toContain('Email and password are required');

      console.log('✅ Empty field validation test passed');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  4. Auto-fill demo credentials button
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline 4: should auto-fill demo credentials and login', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'login-form-004');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      // Use the auto-fill helper
      await orchestrator.click(SEL.autofillButton, {
        description: 'Auto-fill demo credentials button',
      });

      // Verify credentials were populated
      const emailVal    = await page.inputValue(SEL.emailInput);
      const passwordVal = await page.inputValue(SEL.passwordInput);
      expect(emailVal).toBeTruthy();
      expect(passwordVal).toBeTruthy();

      // Submit login
      await orchestrator.click(SEL.loginButton, {
        description: 'Login submit button',
      });

      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
      expect(page.url()).toMatch(INVENTORY_URL);

      console.log('✅ Auto-fill demo credentials test passed');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  5. Full login → logout flow
  // ─────────────────────────────────────────────────────────────────────────
  test('✅ Baseline 5: should complete login then logout', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'login-form-005');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      await orchestrator.fill(SEL.emailInput, VALID_USER.email, {
        description: 'Email input',
      });
      await orchestrator.fill(SEL.passwordInput, VALID_USER.password, {
        description: 'Password input',
      });
      await orchestrator.click(SEL.loginButton, {
        description: 'Login button',
      });

      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });

      // Open side menu – scroll to top first so hamburger is in viewport
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // Click the hamburger (cart button is first, hamburger is the ☰ char)
      const menuBtn = page.locator('button').filter({ hasText: '☰' });
      const menuBtnCount = await menuBtn.count();
      if (menuBtnCount > 0) {
        await menuBtn.first().scrollIntoViewIfNeeded();
        await menuBtn.first().click({ force: true });
      } else {
        // Fallback: click the very first button (top-left hamburger)
        await page.locator('button').first().scrollIntoViewIfNeeded();
        await page.locator('button').first().click({ force: true });
      }

      await page.waitForTimeout(500);

      // Click Logout
      await orchestrator.click(SEL.logoutButton, {
        description: 'Logout button in side menu',
      });

      // Should redirect back to login page
      await page.waitForURL(LOGIN_PAGE, { timeout: 10000 });
      expect(page.url()).toMatch(/swag-testing\.vercel\.app\/?$/);

      // Login form should be visible again
      const emailInput = page.locator(SEL.emailInput);
      await emailInput.waitFor({ state: 'visible', timeout: 5000 });

      console.log('✅ Login → Logout flow test passed');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  //  SELF-HEALING TESTS (broken selectors) – the AI framework detects & recovers
  // ═══════════════════════════════════════════════════════════════════════════

  // ─────────────────────────────────────────────────────────────────────────
  //  6. SELF-HEALING: wrong email selector
  // ─────────────────────────────────────────────────────────────────────────
  test('🔧 Self-Healing 1: should heal when email input selector is wrong', async ({ page }) => {
    test.setTimeout(300000); // 5 min – allows AI retry backoff on 429
    const orchestrator = new TestOrchestrator(page, 'login-form-006-heal');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      // INTENTIONALLY WRONG selector – real one is input[type="email"]
      await orchestrator.fill('[data-testid="email-input-v3"]', VALID_USER.email, {
        description: 'Email address input field on login form',
      });

      await orchestrator.fill(SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });

      await orchestrator.click(SEL.loginButton, {
        description: 'Login button',
      });

      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
      expect(page.url()).toMatch(INVENTORY_URL);

      console.log('✅ Self-healing email selector test passed!');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  7. SELF-HEALING: wrong login button selector
  // ─────────────────────────────────────────────────────────────────────────
  test('🔧 Self-Healing 2: should heal when login button selector is wrong', async ({ page }) => {
    test.setTimeout(300000); // 5 min – allows AI retry backoff on 429
    const orchestrator = new TestOrchestrator(page, 'login-form-007-heal');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      await orchestrator.fill(SEL.emailInput, VALID_USER.email, {
        description: 'Email address input field',
      });

      await orchestrator.fill(SEL.passwordInput, VALID_USER.password, {
        description: 'Password input field',
      });

      // INTENTIONALLY WRONG selector – real one is button:has-text("Login")
      await orchestrator.click('[data-testid="submit-login-btn"]', {
        description: 'Sign In submit button on login form',
      });

      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
      expect(page.url()).toMatch(INVENTORY_URL);

      console.log('✅ Self-healing login button test passed!');
    } finally {
      await orchestrator.finalize();
    }
  });

  // ─────────────────────────────────────────────────────────────────────────
  //  8. SELF-HEALING: wrong password & button selectors (double heal)
  // ─────────────────────────────────────────────────────────────────────────
  test('🔧 Self-Healing 3: should heal multiple wrong selectors in sequence', async ({ page }) => {
    test.setTimeout(300000); // 5 min – allows AI retry backoff on 429
    const orchestrator = new TestOrchestrator(page, 'login-form-008-heal');

    try {
      await orchestrator.goto(LOGIN_PAGE);

      await orchestrator.fill(SEL.emailInput, VALID_USER.email, {
        description: 'Email address input field',
      });

      // WRONG password selector – real one is input[type="password"]
      await orchestrator.fill('[name="user-password-field"]', VALID_USER.password, {
        description: 'Password input field on login form',
      });

      // WRONG button selector – real one matches button:has-text("Login")
      await orchestrator.click('button.submit-login', {
        description: 'Sign In submit button on login form',
      });

      await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
      expect(page.url()).toMatch(INVENTORY_URL);

      console.log('✅ Multi-selector healing test passed!');
    } finally {
      await orchestrator.finalize();
    }
  });
});
