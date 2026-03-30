/**
 * @fileoverview Selector Recovery Agent.
 *
 * Uses AI (OpenAI / Google Gemini / Groq) to propose alternative selectors
 * when a Playwright step fails with "element not found".
 *
 * See design doc § 8.4 – SelectorRecoveryAgent, § 10 – Agent Tooling Model.
 */

const fs = require('fs');
const path = require('path');
const { createAIClient } = require('./ai-client');
const frameworkConfig = require('../../config/framework.config');
const SelectorMemoryStore = require('../memory/selector-memory-store');
const DomSnapshotTool = require('../tools/dom-snapshot-tool');
const AccessibilityTreeTool = require('../tools/accessibility-tree-tool');
const eventBus = require('../telemetry/event-bus');
const { createHealingEvent } = require('../types/contracts');

// Load system prompt
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'selector-system-prompt.md'),
  'utf-8'
);

class SelectorRecoveryAgent {
  /**
   * @param {Object} opts
   * @param {import('@playwright/test').Page} opts.page
   * @param {SelectorMemoryStore} [opts.memoryStore]
   */
  constructor(opts) {
    this.page = opts.page;
    this.memoryStore = opts.memoryStore || new SelectorMemoryStore();
    this.domTool = new DomSnapshotTool(opts.page);
    this.axTool = new AccessibilityTreeTool(opts.page);

    // Unified AI client – works with OpenAI, Google, or Groq
    this.aiClient = createAIClient('selector');
  }

  /**
   * Attempt to recover a selector for a failed step.
   *
   * @param {Object} failedCtx – FailedStepContext
   * @returns {Promise<Object>} SelectorRecoveryResult
   */
  async recover(failedCtx) {
    eventBus.publish(
      createHealingEvent({
        type: 'selector_recovery_invoked',
        testId: failedCtx.testId,
        stepId: failedCtx.stepId,
        payload: {
          action: failedCtx.action,
          originalSelector: failedCtx.originalSelector,
          error: failedCtx.errorMessage,
        },
      })
    );

    // ── 1. Check memory first ────────────────────────────────────────
    const memoryCandidates = this.memoryStore.lookup(failedCtx);
    if (memoryCandidates.length > 0) {
      console.log(
        `[SelectorRecoveryAgent] Found ${memoryCandidates.length} candidates in memory`
      );

      // Validate the top memory candidate still exists on page
      const topMemory = memoryCandidates[0];
      const exists = await this._selectorExists(topMemory.selector);
      if (exists) {
        return {
          candidates: memoryCandidates,
          recommendedSelector: topMemory.selector,
          recommendedConfidence: topMemory.confidence, // Use original confidence for policy, not decayed score
          shouldRetryWithMoreContext: false,
          source: 'memory',
        };
      }
    }

    // ── 2. Gather context ────────────────────────────────────────────
    const domExcerpt =
      failedCtx.domExcerpt || (await this.domTool.capture());
    const axTreeExcerpt =
      failedCtx.axTreeExcerpt || (await this.axTool.capture());

    // ── 3. Call OpenAI ───────────────────────────────────────────────
    const userPrompt = this._buildPrompt(failedCtx, domExcerpt, axTreeExcerpt, memoryCandidates);

    try {
      const response = await this.aiClient.chat(SYSTEM_PROMPT, userPrompt);
      console.log(`[SelectorRecoveryAgent] raw AI response:`, response.content);
      const result = JSON.parse(response.content);

      // Normalize result
      return {
        candidates: result.candidates || [],
        recommendedSelector: result.recommendedSelector || null,
        recommendedConfidence: result.recommendedConfidence || 0,
        shouldRetryWithMoreContext: !!result.shouldRetryWithMoreContext,
        source: response.provider || 'ai',
        tokensUsed: response.tokensUsed || 0,
      };
    } catch (err) {
      console.error(`[SelectorRecoveryAgent] AI call failed:`, err.message);
      return {
        candidates: [],
        recommendedSelector: null,
        recommendedConfidence: 0,
        shouldRetryWithMoreContext: false,
        source: 'error',
        error: err.message,
      };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  _buildPrompt(ctx, domExcerpt, axTreeExcerpt, memoryCandidates) {
    const parts = [
      `## Failed Step`,
      `- **Test ID:** ${ctx.testId}`,
      `- **Step ID:** ${ctx.stepId}`,
      `- **Action:** ${ctx.action}`,
      `- **Target description:** ${ctx.expectedTargetDescription}`,
      `- **Original selector:** ${ctx.originalSelector || 'none'}`,
      `- **URL:** ${ctx.url}`,
      `- **Error:** ${ctx.errorMessage}`,
      '',
      `## DOM Excerpt`,
      '```html',
      domExcerpt,
      '```',
      '',
      `## Accessibility Tree`,
      '```',
      axTreeExcerpt,
      '```',
    ];

    if (memoryCandidates.length > 0) {
      parts.push('');
      parts.push('## Historical Selectors (from memory)');
      for (const mc of memoryCandidates) {
        parts.push(`- \`${mc.selector}\` (strategy: ${mc.strategy}, score: ${mc.score})`);
      }
    }

    parts.push('');
    parts.push('Please return a JSON object with selector candidates as described in your instructions.');

    return parts.join('\n');
  }

  /**
   * Quick check whether a selector resolves to an element on the page.
   * @param {string} selector
   * @returns {Promise<boolean>}
   */
  async _selectorExists(selector) {
    try {
      const trimmed = selector.trim();
      if (trimmed.startsWith('getBy') || trimmed.startsWith('page.')) {
        const expr = trimmed.startsWith('page.') ? trimmed.replace(/^page\./, '') : trimmed;
        const fn = new Function('page', `"use strict"; return page.${expr};`);
        const locator = fn(this.page);
        if (locator && typeof locator.count === 'function') {
           const count = await locator.count();
           return count > 0;
        }
        return false;
      }
      const count = await this.page.locator(trimmed).count();
      return count > 0;
    } catch {
      // Return false if locator evaluation fails or element not found
      return false;
    }
  }
}

module.exports = SelectorRecoveryAgent;
