const path = require('path');
const { pathToFileURL } = require('url');
const { test, expect } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');

const FIXTURE_URL = pathToFileURL(
  path.resolve(__dirname, 'fixtures', 'login-page.html')
).href;

const VALID_USER = {
  email: 'admin@nexus.io',
  password: 'Admin123!',
  name: 'Alex',
};

const INVALID_USER = {
  email: 'admin@nexus.io',
  password: 'wrong-password',
};

const SEL = {
  email: '#email',
  password: '#password',
  submit: '#login-button',
  errorBanner: '#error-banner',
  successBanner: '#success-banner',
  dashboard: '#dashboard',
  loginCard: '#login-card',
  togglePassword: '#toggle-password',
  remember: '#remember',
  logout: '#logout-button',
  forgot: '#forgot-link',
  google: '#btn-google',
  github: '#btn-github',
};

test.describe('Local login fixture coverage', () => {
  test('renders the login experience with all primary controls', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-001', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.assertVisible(SEL.email, { description: 'Email field' });
      await orchestrator.assertVisible(SEL.password, { description: 'Password field' });
      await orchestrator.assertVisible(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.remember)).toBeVisible();
      await expect(page.locator(SEL.forgot)).toBeVisible();
      await expect(page.locator(SEL.google)).toBeVisible();
      await expect(page.locator(SEL.github)).toBeVisible();
    } finally {
      await orchestrator.finalize();
    }
  });

  test('logs in successfully with valid fixture credentials', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-002', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.fill(SEL.email, VALID_USER.email, { description: 'Email field' });
      await orchestrator.fill(SEL.password, VALID_USER.password, { description: 'Password field' });
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.successBanner)).toContainText(`Welcome back, ${VALID_USER.name}`);
      await expect(page.locator(SEL.dashboard)).toHaveClass(/show/);
      await expect(page.locator('#welcome-email')).toHaveText(VALID_USER.email);
    } finally {
      await orchestrator.finalize();
    }
  });

  test('shows an error when credentials are invalid', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-003', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.fill(SEL.email, INVALID_USER.email, { description: 'Email field' });
      await orchestrator.fill(SEL.password, INVALID_USER.password, { description: 'Password field' });
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.errorBanner)).toContainText('Invalid email or password');
      await expect(page.locator(SEL.dashboard)).not.toHaveClass(/show/);
      await expect(page.locator(SEL.password)).toHaveValue('');
    } finally {
      await orchestrator.finalize();
    }
  });

  test('validates missing email and password', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-004', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.errorBanner)).toContainText('Please enter both email and password.');
      await expect(page.locator(SEL.loginCard)).toBeVisible();
    } finally {
      await orchestrator.finalize();
    }
  });

  test('validates malformed email addresses before submit completes', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-005', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.fill(SEL.email, 'admin-at-nexus.io', { description: 'Email field' });
      await orchestrator.fill(SEL.password, VALID_USER.password, { description: 'Password field' });
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.errorBanner)).toContainText('Please enter a valid email address.');
      await expect(page.locator(SEL.dashboard)).not.toHaveClass(/show/);
    } finally {
      await orchestrator.finalize();
    }
  });

  test('validates password minimum length', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-006', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.fill(SEL.email, VALID_USER.email, { description: 'Email field' });
      await orchestrator.fill(SEL.password, '123', { description: 'Password field' });
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.errorBanner)).toContainText('Password must be at least 6 characters.');
      await expect(page.locator(SEL.dashboard)).not.toHaveClass(/show/);
    } finally {
      await orchestrator.finalize();
    }
  });

  test('toggles password visibility without breaking form entry', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-007', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await orchestrator.fill(SEL.password, VALID_USER.password, { description: 'Password field' });
      await orchestrator.click(SEL.togglePassword, { description: 'Password visibility toggle' });
      await expect(page.locator(SEL.password)).toHaveAttribute('type', 'text');
      await orchestrator.click(SEL.togglePassword, { description: 'Password visibility toggle' });
      await expect(page.locator(SEL.password)).toHaveAttribute('type', 'password');
      await expect(page.locator(SEL.password)).toHaveValue(VALID_USER.password);
    } finally {
      await orchestrator.finalize();
    }
  });

  test('supports remember me and allows the user to sign out', async ({ page }) => {
    const orchestrator = new TestOrchestrator(page, 'fixture-login-008', {
      healingEnabled: false,
    });

    try {
      await orchestrator.goto(FIXTURE_URL);
      await page.locator(SEL.remember).check();
      await expect(page.locator(SEL.remember)).toBeChecked();
      await orchestrator.fill(SEL.email, VALID_USER.email, { description: 'Email field' });
      await orchestrator.fill(SEL.password, VALID_USER.password, { description: 'Password field' });
      await orchestrator.click(SEL.submit, { description: 'Sign in button' });
      await expect(page.locator(SEL.dashboard)).toHaveClass(/show/);
      await orchestrator.click(SEL.logout, { description: 'Sign out button' });
      await expect(page.locator(SEL.dashboard)).not.toHaveClass(/show/);
      await expect(page.locator(SEL.loginCard)).toBeVisible();
      await expect(page.locator(SEL.email)).toHaveValue('');
    } finally {
      await orchestrator.finalize();
    }
  });
});
