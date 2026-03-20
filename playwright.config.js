// @ts-check
const { defineConfig, devices } = require('@playwright/test');

/**
 * Agentic Playwright Framework – Configuration
 *
 * Supports two execution modes (set via HEAL_MODE env var):
 *   strict   – no medium-confidence healing (for CI / main branch)
 *   adaptive – allows medium-confidence healing (for nightly / regression)
 *
 * @see https://playwright.dev/docs/test-configuration
 */
module.exports = defineConfig({
  testDir: './tests',

  /* Output dir – use local temp to avoid OneDrive EPERM locks */
  outputDir: process.env.TEMP
    ? require('path').join(process.env.TEMP, 'riya-ai-test-results')
    : './test-results',

  /* Run tests sequentially by default (healing is order-sensitive) */
  fullyParallel: false,

  /* Fail the build on CI if you accidentally left test.only */
  forbidOnly: !!process.env.CI,

  /* Retries handled by the framework's own healing loop */
  retries: 0,

  /* Single worker to avoid state conflicts during healing */
  workers: 1,

  /* Test timeout: 120s to allow for page loads + AI healing calls */
  timeout: 120000,

  /* Reporter: list only (avoids HTML report locking on OneDrive) */
  reporter: [['list']],

  /* Shared settings */
  use: {
    /* Trace off by default to avoid large file locks; enable with trace: 'on' */
    trace: 'off',

    /* Default action timeout – the orchestrator manages its own */
    actionTimeout: 15000,

    /* Screenshot on failure */
    screenshot: 'only-on-failure',

    /* Headless by default; override with --headed */
    headless: true,

    /* Viewport */
    viewport: { width: 1280, height: 720 },
  },

  /* Configure projects */
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
