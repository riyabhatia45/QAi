/**
 * @fileoverview DOM Snapshot Tool.
 *
 * Produces compact, token-efficient DOM excerpts for agents.
 * Redacts sensitive values and limits output size.
 *
 * See design doc § 8.3 – DomSnapshotTool.
 */

const frameworkConfig = require('../../config/framework.config');

class DomSnapshotTool {
  /**
   * @param {import('@playwright/test').Page} page
   */
  constructor(page) {
    this.page = page;
  }

  /**
   * Capture a compact DOM excerpt around a target area.
   *
   * @param {Object} [opts]
   * @param {string} [opts.rootSelector] – CSS selector to scope the snapshot
   * @param {number} [opts.maxLength] – override max character limit
   * @returns {Promise<string>} Cleaned DOM string
   */
  async capture(opts = {}) {
    const maxLen = opts.maxLength || frameworkConfig.safety.maxDomExcerptLength;
    const rootSelector = opts.rootSelector || 'body';

    const rawHtml = await this.page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return '';
      return root.innerHTML;
    }, rootSelector);

    let cleaned = this._stripNoise(rawHtml);
    cleaned = this._redactSensitive(cleaned);

    if (cleaned.length > maxLen) {
      cleaned = cleaned.substring(0, maxLen) + '\n<!-- truncated -->';
    }

    return cleaned;
  }

  /**
   * Capture only semantic attributes useful for selector recovery:
   * role, name, aria-*, data-testid, id, type, placeholder.
   *
   * @param {string} [rootSelector]
   * @returns {Promise<Object[]>} Array of { tag, id, role, name, testId, ariaLabel, text }
   */
  async captureSemanticNodes(rootSelector = 'body') {
    return this.page.evaluate((sel) => {
      const root = document.querySelector(sel);
      if (!root) return [];

      const nodes = [];
      const walk = (el) => {
        if (el.nodeType !== 1) return; // ELEMENT_NODE
        const entry = {
          tag: el.tagName.toLowerCase(),
          id: el.id || null,
          role: el.getAttribute('role') || el.tagName.toLowerCase(),
          name: el.getAttribute('name') || null,
          testId: el.getAttribute('data-testid') || null,
          ariaLabel: el.getAttribute('aria-label') || null,
          placeholder: el.getAttribute('placeholder') || null,
          type: el.getAttribute('type') || null,
          text: (el.textContent || '').trim().substring(0, 80) || null,
        };
        // Only include interactive or semantically relevant elements
        const interactiveTags = ['a', 'button', 'input', 'select', 'textarea', 'label', 'form', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'nav', 'main', 'dialog'];
        const hasRole = el.getAttribute('role');
        const hasTestId = el.getAttribute('data-testid');
        if (interactiveTags.includes(entry.tag) || hasRole || hasTestId) {
          nodes.push(entry);
        }
        for (const child of el.children) {
          walk(child);
        }
      };
      walk(root);
      return nodes;
    }, rootSelector);
  }

  // ─── Internal Helpers ────────────────────────────────────────────────

  /**
   * Strip scripts, styles, SVG internals, and excessive whitespace.
   */
  _stripNoise(html) {
    return html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<svg[\s\S]*?<\/svg>/gi, '<svg/>')
      .replace(/\s{2,}/g, ' ')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }

  /**
   * Redact attribute values that look sensitive.
   */
  _redactSensitive(html) {
    const patterns = frameworkConfig.safety.redactAttributes;
    let result = html;
    for (const attr of patterns) {
      // Redact value="..." on inputs whose name/type matches
      const regex = new RegExp(
        `(name=["']${attr}["'][^>]*value=["'])([^"']*)(["'])`,
        'gi'
      );
      result = result.replace(regex, '$1[REDACTED]$3');
    }
    return result;
  }
}

module.exports = DomSnapshotTool;
