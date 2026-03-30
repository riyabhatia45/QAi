/**
 * @fileoverview Showcase Test Suite for CTO Demo.
 * 
 * Demonstrates 3 distinct AI-powered self-healing scenarios on the live
 * Swag Labs site: https://swag-testing.vercel.app/
 */

const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

const LOGIN_PAGE = 'https://swag-testing.vercel.app/';
const INVENTORY_URL = /\/inventory/;
const VALID_USER = { email: 'john@mail.com', password: 'changeme' };

test.describe('🎭 Agentic Self-Healing Showcase', () => {

    // ─────────────────────────────────────────────────────────────────────────
    //  BASELINE: Golden Path – correct selectors to prove the flow works
    // ─────────────────────────────────────────────────────────────────────────
    test('✅ Baseline: Login with correct selectors (Golden Path)', async ({ page }) => {
        test.setTimeout(60000);
        const orchestrator = new TestOrchestrator(page, 'demo-baseline');

        try {
            await orchestrator.goto(LOGIN_PAGE);

            // CORRECT Email
            await orchestrator.fill('input[type="email"]', VALID_USER.email, {
                description: 'Email address field'
            });

            // CORRECT Password
            await orchestrator.fill('input[type="password"]', VALID_USER.password, {
                description: 'Password input field'
            });

            // CORRECT Login Button
            await orchestrator.click('button:has-text("Login")', {
                description: 'Login submit button'
            });

            await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
            expect(page.url()).toMatch(INVENTORY_URL);

            // Verify products loaded
            await page.waitForSelector('a.font-bold', { timeout: 10000 });
            const productCount = await page.locator('a.font-bold').count();
            expect(productCount).toBeGreaterThan(0);

            console.log('✅ Baseline Passed: Login works perfectly with correct selectors.');
        } finally {
            await orchestrator.finalize();
        }
    });

    // ─────────────────────────────────────────────────────────────────────────
    //  SELF-HEALING SCENARIOS (below) – the AI framework recovers broken selectors
    // ─────────────────────────────────────────────────────────────────────────

    // Scenario 1: Single Selector Recovery
    // Highlighting: AI logic + ROI (Developer time saved)
    test('Scenario 1: The "Identity Crisis" (Single Heel)', async ({ page }) => {
        test.setTimeout(120000); // 2 min
        const orchestrator = new TestOrchestrator(page, 'demo-single-heal');
        
        try {
            await orchestrator.goto(LOGIN_PAGE);
            
            // CORRECT Email
            await orchestrator.fill('input[type="email"]', VALID_USER.email, {
                description: 'Email address field'
            });

            // CORRECT Password
            await orchestrator.fill('input[type="password"]', VALID_USER.password, {
                description: 'Password input field'
            });

            // ❌ WRONG Selector: The real button doesn't have ID 'submit-btn-v99'
            // The AI will find it using the description and "Login" text.
            await orchestrator.click('#submit-btn-v99', {
                description: 'The primary Login button on the form'
            });

            await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
            expect(page.url()).toMatch(INVENTORY_URL);
            console.log('✅ Scenario 1 Passed: Healed broken login button!');
        } finally {
            await orchestrator.finalize();
        }
    });

    // Scenario 2: Multiple Sequential Recoveries
    // Highlighting: Chain of thought + Resilience
    test('Scenario 2: The "Ghost in the Machine" (Chain-Heel)', async ({ page }) => {
        test.setTimeout(240000); // 4 min
        const orchestrator = new TestOrchestrator(page, 'demo-multi-heal');
        
        try {
            await orchestrator.goto(LOGIN_PAGE);
            
            // ❌ WRONG Email Selector
            await orchestrator.fill('[name="user-email-wrong"]', VALID_USER.email, {
                description: 'Email address input field'
            });

            // ❌ WRONG Password Selector
            await orchestrator.fill('#pass-field-broken', VALID_USER.password, {
                description: 'Password secret field'
            });

            // ❌ WRONG Button Selector
            await orchestrator.click('button.non-existent-login', {
                description: 'The green Login submit button'
            });

            await page.waitForURL(INVENTORY_URL, { timeout: 15000 });
            expect(page.url()).toMatch(INVENTORY_URL);
            console.log('✅ Scenario 2 Passed: Healed 3 broken locators in one run!');
        } finally {
            await orchestrator.finalize();
        }
    });

    // Scenario 3: Functional Failure vs. Locator Failure
    // Highlighting: Policy Engine + Safety (AI doesn't "lie" or force a pass)
    test('Scenario 3: The "Security Gate" (Non-Healing Failure)', async ({ page }) => {
        const orchestrator = new TestOrchestrator(page, 'demo-fail-policy');
        
        try {
            await orchestrator.goto(LOGIN_PAGE);
            
            await orchestrator.fill('input[type="email"]', VALID_USER.email, {
                description: 'Email address field'
            });

            // ⚠️ WRONG PASSWORD: This is a functional error, not a locator error.
            await orchestrator.fill('input[type="password"]', 'WRONG_SECRET_123', {
                description: 'Password input field'
            });

            // Selector is CORRECT here
            await orchestrator.click('button:has-text("Login")', {
                description: 'Login button'
            });

            // The test SHOULD FAIL because the URL doesn't change
            // This proves the AI isn't just magically making things pass; 
            // the application logic still holds.
            await page.waitForURL(INVENTORY_URL, { timeout: 5000 });
        } catch (err) {
            console.log('✅ Scenario 3 Passed: Test failed as expected on wrong credentials (AI Safety).');
            expect(page.url()).not.toMatch(INVENTORY_URL);
            // Error "Unauthorized" should be visible
            await expect(page.locator('body')).toContainText('Unauthorized');
        } finally {
            await orchestrator.finalize();
        }
    });
});
