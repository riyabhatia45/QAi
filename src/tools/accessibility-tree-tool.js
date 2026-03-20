/**
 * @fileoverview Accessibility Tree Tool.
 *
 * Uses Playwright's page.evaluate + ARIA attributes to produce a compact
 * textual representation of interactive elements on the page.
 * This gives agents high-signal, low-token context about interactive elements.
 *
 * Note: page.accessibility.snapshot() was removed in Playwright v1.50+.
 * This implementation uses DOM-based ARIA extraction instead.
 */

class AccessibilityTreeTool {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Capture a simplified accessibility tree via DOM evaluation.
   * @param {Object} [opts]
   * @param {boolean} [opts.interestingOnly=true] – if true, filters to interactive/visible elements
   * @returns {Promise<string>} Text representation of the AX tree
   */
  async capture(opts = {}) {
    const interestingOnly = opts.interestingOnly !== false;

    try {
      const nodes = await this.page.evaluate((filterInteresting) => {
        const results = [];
        const interactiveTags = [
          'a', 'button', 'input', 'select', 'textarea', 'label',
          'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
          'img', 'nav', 'main', 'dialog', 'details', 'summary',
        ];
        const interactiveRoles = [
          'button', 'link', 'textbox', 'checkbox', 'radio',
          'combobox', 'listbox', 'menu', 'menuitem', 'tab',
          'tabpanel', 'dialog', 'alert', 'navigation', 'banner',
          'heading', 'img', 'search', 'form',
        ];

        function walk(el, depth) {
          if (!el || el.nodeType !== 1) return;

          const tag = el.tagName.toLowerCase();
          const role = el.getAttribute('role') || '';
          const isInteractive =
            interactiveTags.includes(tag) ||
            interactiveRoles.includes(role) ||
            el.getAttribute('data-testid') ||
            el.getAttribute('aria-label');

          if (!filterInteresting || isInteractive) {
            const name =
              el.getAttribute('aria-label') ||
              el.getAttribute('name') ||
              el.getAttribute('title') ||
              el.getAttribute('placeholder') ||
              (el.textContent || '').trim().substring(0, 60);

            const effectiveRole = role || tag;

            let entry = `${'  '.repeat(depth)}${effectiveRole}`;
            if (name) entry += ` name="${name}"`;
            if (el.id) entry += ` id="${el.id}"`;
            if (el.getAttribute('type')) entry += ` type="${el.getAttribute('type')}"`;
            if (el.getAttribute('data-testid')) entry += ` testid="${el.getAttribute('data-testid')}"`;
            if (el.disabled) entry += ' [disabled]';
            if (el.getAttribute('aria-hidden') === 'true') entry += ' [hidden]';

            results.push(entry);
          }

          for (const child of el.children) {
            walk(child, depth + 1);
          }
        }

        walk(document.body, 0);
        return results;
      }, interestingOnly);

      if (!nodes || nodes.length === 0) {
        return '(empty accessibility tree)';
      }

      return nodes.join('\n');
    } catch (err) {
      console.warn('[AccessibilityTreeTool] capture failed:', err.message);
      return '(accessibility tree unavailable)';
    }
  }
}

module.exports = AccessibilityTreeTool;
