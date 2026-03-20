/**
 * @fileoverview Assertion Helper Agent.
 *
 * A lightweight agent that helps generate or recover assertions
 * when a test's expected state doesn't match. This is a secondary
 * agent used after flow recovery to verify the page is back on track.
 */

const frameworkConfig = require('../../config/framework.config');
const DomSnapshotTool = require('../tools/dom-snapshot-tool');
const AccessibilityTreeTool = require('../tools/accessibility-tree-tool');

class AssertionHelperAgent {
  /**
   * @param {Object} opts
   * @param {import('@playwright/test').Page} opts.page
   */
  constructor(opts) {
    this.page = opts.page;
    this.domTool = new DomSnapshotTool(opts.page);
    this.axTool = new AccessibilityTreeTool(opts.page);
  }

  /**
   * Verify that the page matches an expected state description.
   * Uses heuristic checks (no AI call) for speed.
   *
   * @param {Object} check
   * @param {string} check.expectedTitle – partial title match
   * @param {string} [check.expectedUrl] – partial URL match
   * @param {string} [check.expectedText] – text that should be visible
   * @param {string} [check.expectedSelector] – element that should exist
   * @returns {Promise<{passed: boolean, details: string}>}
   */
  async verifyState(check) {
    const results = [];

    // Title check
    if (check.expectedTitle) {
      const title = await this.page.title();
      const titleMatch = title.toLowerCase().includes(check.expectedTitle.toLowerCase());
      results.push({
        check: 'title',
        passed: titleMatch,
        detail: `Title "${title}" ${titleMatch ? 'contains' : 'does not contain'} "${check.expectedTitle}"`,
      });
    }

    // URL check
    if (check.expectedUrl) {
      const url = this.page.url();
      const urlMatch = url.toLowerCase().includes(check.expectedUrl.toLowerCase());
      results.push({
        check: 'url',
        passed: urlMatch,
        detail: `URL "${url}" ${urlMatch ? 'contains' : 'does not contain'} "${check.expectedUrl}"`,
      });
    }

    // Text visibility check
    if (check.expectedText) {
      try {
        const visible = await this.page
          .getByText(check.expectedText, { exact: false })
          .first()
          .isVisible({ timeout: 3000 });
        results.push({
          check: 'text',
          passed: visible,
          detail: `Text "${check.expectedText}" ${visible ? 'is' : 'is not'} visible`,
        });
      } catch {
        results.push({
          check: 'text',
          passed: false,
          detail: `Text "${check.expectedText}" is not visible (timeout)`,
        });
      }
    }

    // Element existence check
    if (check.expectedSelector) {
      try {
        const count = await this.page.locator(check.expectedSelector).count();
        results.push({
          check: 'element',
          passed: count > 0,
          detail: `Selector "${check.expectedSelector}" found ${count} elements`,
        });
      } catch {
        results.push({
          check: 'element',
          passed: false,
          detail: `Selector "${check.expectedSelector}" threw an error`,
        });
      }
    }

    const allPassed = results.every((r) => r.passed);
    const details = results.map((r) => `[${r.passed ? '✓' : '✗'}] ${r.detail}`).join('\n');

    return { passed: allPassed, details };
  }
}

module.exports = AssertionHelperAgent;
