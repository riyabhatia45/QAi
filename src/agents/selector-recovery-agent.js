/**
 * @fileoverview Selector Recovery Agent.
 *
 * Uses OpenAI (structured output) to propose alternative selectors
 * when a Playwright step fails with "element not found".
 *
 * See design doc § 8.4 – SelectorRecoveryAgent, § 10 – Agent Tooling Model.
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
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

    this.openai = new OpenAI({
      apiKey: frameworkConfig.openai.apiKey,
      timeout: frameworkConfig.openai.requestTimeoutMs,
    });

    this.model = frameworkConfig.openai.selectorModel;
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
          recommendedConfidence: topMemory.score,
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
      const completion = await this.openai.chat.completions.create({
        model: this.model,
        max_tokens: frameworkConfig.openai.maxTokens,
        temperature: 0.2,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
      });

      const raw = completion.choices[0]?.message?.content;
      const result = JSON.parse(raw);

      // Normalize result
      return {
        candidates: result.candidates || [],
        recommendedSelector: result.recommendedSelector || null,
        recommendedConfidence: result.recommendedConfidence || 0,
        shouldRetryWithMoreContext: !!result.shouldRetryWithMoreContext,
        source: 'openai',
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (err) {
      console.error('[SelectorRecoveryAgent] OpenAI call failed:', err.message);
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
      // Handle getByRole/getByText style selectors vs CSS selectors
      if (selector.startsWith('getBy') || selector.startsWith('page.')) {
        // For Playwright locator syntax, we can't easily eval here
        // Fall through to let the orchestrator validate
        return false;
      }
      const count = await this.page.locator(selector).count();
      return count > 0;
    } catch {
      return false;
    }
  }
}

module.exports = SelectorRecoveryAgent;
