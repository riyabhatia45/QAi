/**
 * @fileoverview Flow Recovery Agent.
 *
 * Detects state drift (unexpected page, modal, redirect) and produces
 * a constrained action plan to get the test flow back on track.
 *
 * See design doc § 8.5 – FlowRecoveryAgent, § 11.2 – Flow-Level Healing.
 */

const fs = require('fs');
const path = require('path');
const OpenAI = require('openai');
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

    this.openai = new OpenAI({
      apiKey: frameworkConfig.openai.apiKey,
      timeout: frameworkConfig.openai.requestTimeoutMs,
    });

    this.model = frameworkConfig.openai.flowModel;
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
      const plan = JSON.parse(raw);

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
        source: 'openai',
        tokensUsed: completion.usage?.total_tokens || 0,
      };
    } catch (err) {
      console.error('[FlowRecoveryAgent] OpenAI call failed:', err.message);
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
