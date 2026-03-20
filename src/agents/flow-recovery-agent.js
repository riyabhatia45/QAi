/**
 * @fileoverview Flow Recovery Agent.
 *
 * Detects state drift (unexpected page, modal, redirect) and produces
 * a constrained action plan to get the test flow back on track.
 *
 * Supports: OpenAI, Google Gemini, Groq (via AI_PROVIDER env var).
 * See design doc § 8.5 – FlowRecoveryAgent, § 11.2 – Flow-Level Healing.
 */

const fs = require('fs');
const path = require('path');
const { createAIClient } = require('./ai-client');
const frameworkConfig = require('../../config/framework.config');
const FlowMemoryStore = require('../memory/flow-memory-store');
const DomSnapshotTool = require('../tools/dom-snapshot-tool');
const AccessibilityTreeTool = require('../tools/accessibility-tree-tool');
const eventBus = require('../telemetry/event-bus');
const { createHealingEvent } = require('../types/contracts');

// Load system prompt
const SYSTEM_PROMPT = fs.readFileSync(
  path.join(__dirname, 'prompts', 'flow-system-prompt.md'),
  'utf-8'
);

class FlowRecoveryAgent {
  /**
   * @param {Object} opts
   * @param {import('@playwright/test').Page} opts.page
   * @param {FlowMemoryStore} [opts.memoryStore]
   */
  constructor(opts) {
    this.page = opts.page;
    this.memoryStore = opts.memoryStore || new FlowMemoryStore();
    this.domTool = new DomSnapshotTool(opts.page);
    this.axTool = new AccessibilityTreeTool(opts.page);

    // Unified AI client – works with OpenAI, Google, or Groq
    this.aiClient = createAIClient('flow');
  }

  /**
   * Attempt to recover from flow-level drift.
   *
   * @param {Object} ctx
   * @param {string} ctx.expectedState – what the test expected
   * @param {string} ctx.observedState – what the page shows
   * @param {string[]} ctx.recentSteps – last few steps performed
   * @param {string} ctx.url – current URL
   * @param {string} ctx.testId
   * @returns {Promise<Object>} FlowRecoveryPlan
   */
  async recover(ctx) {
    eventBus.publish(
      createHealingEvent({
        type: 'flow_recovery_invoked',
        testId: ctx.testId,
        payload: {
          expectedState: ctx.expectedState,
          observedState: ctx.observedState,
          url: ctx.url,
        },
      })
    );

    // ── 1. Check memory first ────────────────────────────────────────
    const memorizedPlan = this.memoryStore.lookup({
      expectedState: ctx.expectedState,
      observedState: ctx.observedState,
      url: ctx.url,
    });

    if (memorizedPlan) {
      console.log('[FlowRecoveryAgent] Found matching plan in memory');
      return {
        ...memorizedPlan.plan,
        source: 'memory',
      };
    }

    // ── 2. Gather context ────────────────────────────────────────────
    const domExcerpt = await this.domTool.capture();
    const axTreeExcerpt = await this.axTool.capture();

    // ── 3. Call OpenAI ───────────────────────────────────────────────
    const userPrompt = this._buildPrompt(ctx, domExcerpt, axTreeExcerpt);

    try {
      const response = await this.aiClient.chat(SYSTEM_PROMPT, userPrompt);
      const plan = JSON.parse(response.content);

      // Validate actions are in the allowlist
      const policyConfig = require('../../config/policy.config');
      const validActions = plan.actions?.filter((a) =>
        policyConfig.actions.allowlist.includes(a.action)
      );

      return {
        planId: plan.planId || `flow-recover-${Date.now()}`,
        confidence: plan.confidence || 0,
        actions: validActions || [],
        expectedStateAfterPlan: plan.expectedStateAfterPlan || '',
        source: response.provider || 'ai',
        tokensUsed: response.tokensUsed || 0,
      };
    } catch (err) {
      console.error(`[FlowRecoveryAgent] AI call failed:`, err.message);
      return {
        planId: `flow-recover-error-${Date.now()}`,
        confidence: 0,
        actions: [],
        expectedStateAfterPlan: '',
        source: 'error',
        error: err.message,
      };
    }
  }

  // ─── Private Helpers ──────────────────────────────────────────────────

  _buildPrompt(ctx, domExcerpt, axTreeExcerpt) {
    const parts = [
      `## Flow Drift Detected`,
      `- **Test ID:** ${ctx.testId}`,
      `- **Expected state:** ${ctx.expectedState}`,
      `- **Observed state:** ${ctx.observedState}`,
      `- **Current URL:** ${ctx.url}`,
      '',
      `## Recent Steps`,
      ...ctx.recentSteps.map((s, i) => `${i + 1}. ${s}`),
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
      '',
      'Please return a JSON recovery plan as described in your instructions.',
    ];

    return parts.join('\n');
  }
}

module.exports = FlowRecoveryAgent;
