const { test } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');
const scenarios = require('../test-data/retail-flow-coverage.json').filter((scenario) =>
  [
    'retail-healing-025',
    'retail-healing-026',
    'retail-healing-027',
    'retail-healing-028',
  ].includes(scenario.testId)
);
const { runRetailStep, slugify } = require('./retail-scenario-runner');

test.describe('Retail P0 self-healing flows', () => {
  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      test.setTimeout(scenario.timeoutMs || 180000);
      const orchestrator = new TestOrchestrator(page, scenario.testId || slugify(scenario.name));

      try {
        for (const step of scenario.steps) {
          await runRetailStep(page, orchestrator, step);
        }
      } finally {
        await orchestrator.finalize();
      }
    });
  }
});
