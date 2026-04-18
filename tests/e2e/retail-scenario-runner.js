const { expect } = require('@playwright/test');

async function runRetailStep(page, orchestrator, step) {
  switch (step.action) {
    case 'goto':
      await orchestrator.goto(step.target, {
        timeout: step.timeoutMs || 60000,
      });
      return;
    case 'fill':
      await orchestrator.fill(step.target, step.value, {
        description: step.description,
        timeout: step.timeoutMs || 15000,
      });
      return;
    case 'check':
      await resolveLocator(page, step.target).check({
        timeout: step.timeoutMs || 15000,
      });
      return;
    case 'click':
      await orchestrator.click(step.target, {
        description: step.description,
        timeout: step.timeoutMs || 15000,
      });
      return;
    case 'waitForURL':
      await orchestrator.waitForURL(toUrlPattern(step.target), {
        timeout: step.timeoutMs || 60000,
      });
      return;
    case 'assertVisible':
      await orchestrator.assertVisible(step.target, {
        description: step.description,
        timeout: step.timeoutMs || 15000,
      });
      return;
    case 'assertText':
      await expect(resolveLocator(page, step.target)).toHaveText(step.value, {
        timeout: step.timeoutMs || 15000,
      });
      return;
    case 'assertCountAtLeast': {
      const timeoutMs = step.timeoutMs || 15000;
      const locator = resolveLocator(page, step.target);
      let count = 0;
      const start = Date.now();

      while (Date.now() - start < timeoutMs) {
        count = await locator.count();
        if (count >= step.value) {
          break;
        }
        await page.waitForTimeout(250);
      }

      expect(count).toBeGreaterThanOrEqual(step.value);
      return;
    }
    default:
      throw new Error(`Unsupported retail scenario action: ${step.action}`);
  }
}

function resolveLocator(page, expression) {
  if (!expression || typeof expression !== 'string') {
    throw new Error(`Invalid locator expression: ${expression}`);
  }

  const trimmed = expression.trim();
  const normalized = trimmed.startsWith('page.') ? trimmed.slice(5) : trimmed;
  const forbidden = /;|require\s*\(|import\s|eval\s*\(|process\.|__proto__|prototype\[/i;

  if (forbidden.test(normalized)) {
    throw new Error(`Unsafe locator expression: ${expression}`);
  }

  const locator = new Function('page', `"use strict"; return page.${normalized};`)(page);

  if (!locator || typeof locator.click !== 'function') {
    throw new Error(`Expression did not resolve to a Playwright locator: ${expression}`);
  }

  return locator;
}

function toUrlPattern(value) {
  if (typeof value === 'string' && value.startsWith('/') && value.endsWith('/')) {
    return new RegExp(value.slice(1, -1));
  }

  return value;
}

function slugify(value) {
  return String(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

module.exports = {
  runRetailStep,
  resolveLocator,
  toUrlPattern,
  slugify,
};
