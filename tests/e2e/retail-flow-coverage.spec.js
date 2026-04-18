const { test } = require('@playwright/test');
const TestOrchestrator = require('../../src/core/test-orchestrator');
const scenarios = require('../test-data/retail-flow-coverage.json');
const { runRetailStep, slugify } = require('./retail-scenario-runner');

test.describe('Retail website flow coverage', () => {
  for (const scenario of scenarios) {
    test(scenario.name, async ({ page }) => {
      test.setTimeout(scenario.timeoutMs || 120000);
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
