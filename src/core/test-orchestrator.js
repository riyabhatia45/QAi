/**
 * @fileoverview Test Orchestrator – the central execution engine.
 *
 * Wraps every Playwright action in a recoverable execution unit.
 * On failure, routes to the correct agent (selector vs flow),
 * applies policy decisions, and logs everything.
 *
 * See design doc § 8.1 – TestOrchestrator, § 7 – End-to-End Runtime Flow.
 *
 * Usage in a test:
 *   const orchestrator = new TestOrchestrator(page, 'login-001');
 *   await orchestrator.click('#submit-btn', { description: 'Submit login form' });
 *   await orchestrator.fill('#email', 'user@example.com', { description: 'Email field' });
 */

const frameworkConfig = require('../../config/framework.config');
const PolicyEngine = require('./policy-engine');
const SelectorRecoveryAgent = require('../agents/selector-recovery-agent');
const FlowRecoveryAgent = require('../agents/flow-recovery-agent');
const SelectorMemoryStore = require('../memory/selector-memory-store');
const FlowMemoryStore = require('../memory/flow-memory-store');
const RunContextStore = require('../memory/run-context-store');
const DomSnapshotTool = require('../tools/dom-snapshot-tool');
const AccessibilityTreeTool = require('../tools/accessibility-tree-tool');
const ScreenshotTool = require('../tools/screenshot-tool');
const NetworkLogTool = require('../tools/network-log-tool');
const HealingReportWriter = require('../telemetry/healing-report-writer');
const eventBus = require('../telemetry/event-bus');
const { createFailedStepContext, createHealingEvent } = require('../types/contracts');

class TestOrchestrator {
  /**
   * @param {import('@playwright/test').Page} page
   * @param {string} testId – unique identifier for this test
   * @param {Object} [opts]
   */
  constructor(page, testId, opts = {}) {
    this.page = page;
    this.testId = testId;
    this._stepCounter = 0;

    // ── Core components ─────────────────────────────────────────────
    this.policyEngine = new PolicyEngine();
    this.runContext = new RunContextStore(testId);

    // ── Memory ──────────────────────────────────────────────────────
    this.selectorMemory = opts.selectorMemory || new SelectorMemoryStore();
    this.flowMemory = opts.flowMemory || new FlowMemoryStore();

    // ── Agents ──────────────────────────────────────────────────────
    this.selectorAgent = new SelectorRecoveryAgent({
      page,
      memoryStore: this.selectorMemory,
    });
    this.flowAgent = new FlowRecoveryAgent({
      page,
      memoryStore: this.flowMemory,
    });

    // ── Tools ───────────────────────────────────────────────────────
    this.domTool = new DomSnapshotTool(page);
    this.axTool = new AccessibilityTreeTool(page);
    this.screenshotTool = new ScreenshotTool(page);
    this.networkTool = new NetworkLogTool(page);

    // ── Telemetry ───────────────────────────────────────────────────
    this.reportWriter = opts.reportWriter || new HealingReportWriter();

    // Start network capture
    this.networkTool.startCapture();
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PUBLIC ACTION METHODS
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Navigate to a URL.
   * @param {string} url
   * @param {Object} [opts]
   */
  async goto(url, opts = {}) {
    const stepId = this._nextStepId('goto');
    try {
      await this.page.goto(url, {
        timeout: opts.timeout || 30000,
        waitUntil: 'domcontentloaded',
      });
      // Wait a moment for dynamic content to render
      await this.page.waitForLoadState('networkidle').catch(() => {});
      this.runContext.recordUrl(url);
      this.runContext.recordStep({ stepId, action: 'goto', selector: url, result: 'pass' });
    } catch (err) {
      this.runContext.recordStep({ stepId, action: 'goto', selector: url, result: 'fail' });
      throw err;
    }
  }

  /**
   * Click an element with self-healing.
   * @param {string} selector
   * @param {Object} [opts]
   * @param {string} [opts.description] – human description of the target
   * @param {number} [opts.timeout]
   */
  async click(selector, opts = {}) {
    return this._executeWithHealing('click', selector, null, opts);
  }

  /**
   * Fill an input with self-healing.
   * @param {string} selector
   * @param {string} value
   * @param {Object} [opts]
   */
  async fill(selector, value, opts = {}) {
    return this._executeWithHealing('fill', selector, value, opts);
  }

  /**
   * Select an option with self-healing.
   * @param {string} selector
   * @param {string} value
   * @param {Object} [opts]
   */
  async select(selector, value, opts = {}) {
    return this._executeWithHealing('select', selector, value, opts);
  }

  /**
   * Assert element visibility with self-healing.
   * @param {string} selector
   * @param {Object} [opts]
   */
  async assertVisible(selector, opts = {}) {
    return this._executeWithHealing('assert', selector, null, opts);
  }

  /**
   * Wait for a URL pattern.
   * @param {string|RegExp} urlPattern
   * @param {Object} [opts]
   */
  async waitForURL(urlPattern, opts = {}) {
    const stepId = this._nextStepId('waitForURL');
    try {
      await this.page.waitForURL(urlPattern, {
        timeout: opts.timeout || frameworkConfig.execution.actionTimeoutMs,
      });
      this.runContext.recordUrl(this.page.url());
      this.runContext.recordStep({ stepId, action: 'waitForURL', selector: String(urlPattern), result: 'pass' });
    } catch (err) {
      this.runContext.recordStep({ stepId, action: 'waitForURL', selector: String(urlPattern), result: 'fail' });
      // URL mismatch could indicate flow drift
      await this._attemptFlowRecovery(stepId, {
        expectedState: `Expected URL matching: ${urlPattern}`,
        observedState: `Current URL: ${this.page.url()}`,
      });
    }
  }

  /**
   * Detect flow drift and attempt recovery.
   * Call this when the test expects specific page state.
   *
   * @param {Object} expected
   * @param {string} expected.state – human description of expected state
   * @param {string} [expected.title] – expected page title (partial)
   * @param {string} [expected.url] – expected URL (partial)
   * @param {string} [expected.selector] – element that should exist
   */
  async assertState(expected) {
    const stepId = this._nextStepId('assertState');
    const checks = [];

    if (expected.title) {
      const title = await this.page.title();
      if (!title.toLowerCase().includes(expected.title.toLowerCase())) {
        checks.push(`Title "${title}" does not contain "${expected.title}"`);
      }
    }

    if (expected.url) {
      const url = this.page.url();
      if (!url.toLowerCase().includes(expected.url.toLowerCase())) {
        checks.push(`URL "${url}" does not contain "${expected.url}"`);
      }
    }

    if (expected.selector) {
      const count = await this.page.locator(expected.selector).count();
      if (count === 0) {
        checks.push(`Selector "${expected.selector}" not found`);
      }
    }

    if (checks.length > 0) {
      console.warn(`[TestOrchestrator] State mismatch: ${checks.join('; ')}`);
      await this._attemptFlowRecovery(stepId, {
        expectedState: expected.state,
        observedState: checks.join('; '),
      });
    } else {
      this.runContext.recordStep({
        stepId,
        action: 'assertState',
        selector: expected.state,
        result: 'pass',
      });
    }
  }

  /**
   * Flush all healing reports to disk.
   * Call this in afterEach.
   */
  async finalize() {
    eventBus.publish(
      createHealingEvent({
        type: 'test_completed',
        testId: this.testId,
        payload: this.runContext.toSummary(),
      })
    );

    // Apply memory decay
    this.selectorMemory.applyDecay();

    // Write reports
    await this.reportWriter.flush(this.testId);
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  CORE HEALING LOOP
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Execute a Playwright action with deterministic retries + agent healing.
   *
   * @param {'click'|'fill'|'select'|'assert'} action
   * @param {string} selector
   * @param {*} value
   * @param {Object} opts
   */
  async _executeWithHealing(action, selector, value, opts = {}) {
    const stepId = this._nextStepId(action);
    const timeout = opts.timeout || frameworkConfig.execution.actionTimeoutMs;
    const description = opts.description || `${action} on ${selector}`;

    // ── Step 1: Try the original selector ───────────────────────────
    try {
      await this._performAction(action, selector, value, timeout);
      this.runContext.recordStep({ stepId, action, selector, result: 'pass' });
      this.runContext.recordUrl(this.page.url());
      return;
    } catch (originalError) {
      console.warn(
        `[TestOrchestrator] Step failed: ${action} "${selector}" – ${originalError.message}`
      );

      eventBus.publish(
        createHealingEvent({
          type: 'step_failed',
          testId: this.testId,
          stepId,
          payload: { action, selector, error: originalError.message },
        })
      );

      // ── Step 2: Screenshot before healing ─────────────────────────
      let screenshotPath = null;
      try {
        screenshotPath = await this.screenshotTool.capture({
          testId: this.testId,
          stepId,
          phase: 'before_heal',
        });
      } catch { /* ignore screenshot failures */ }

      // ── Step 3: Build failure context ─────────────────────────────
      let domExcerpt = '';
      let axTreeExcerpt = '';
      try {
        domExcerpt = await this.domTool.capture();
        axTreeExcerpt = await this.axTool.capture();
      } catch { /* ignore context capture failures */ }

      const failedCtx = createFailedStepContext({
        testId: this.testId,
        stepId,
        action,
        expectedTargetDescription: description,
        originalSelector: selector,
        url: this.page.url(),
        domExcerpt,
        axTreeExcerpt,
        screenshotPath,
        errorMessage: originalError.message,
      });

      // ── Step 4: Invoke Selector Recovery Agent ────────────────────
      this.runContext.selectorRecoveryAttempts++;
      const recoveryResult = await this.selectorAgent.recover(failedCtx);

      // ── Step 5: Policy decision ───────────────────────────────────
      const decision = this.policyEngine.evaluateSelectorRecovery(
        recoveryResult,
        this.runContext
      );

      this.runContext.recordHealingDecision({
        stepId,
        type: 'selector_recovery',
        decision: decision.decision,
        reason: decision.reason,
        confidence: decision.confidence,
        recommendedSelector: recoveryResult.recommendedSelector,
        source: recoveryResult.source,
      });

      if (decision.decision === 'retry' && this.runContext.selectorRecoveryAttempts < 2) {
        // Retry with expanded DOM context
        console.log('[TestOrchestrator] Retrying with more context...');
        const bigDom = await this.domTool.capture({ maxLength: 8000 });
        failedCtx.domExcerpt = bigDom;
        this.runContext.selectorRecoveryAttempts++;
        const retryResult = await this.selectorAgent.recover(failedCtx);
        const retryDecision = this.policyEngine.evaluateSelectorRecovery(
          retryResult,
          this.runContext
        );

        if (retryDecision.decision === 'apply' && retryResult.recommendedSelector) {
          return await this._applyHealedSelector(
            action, retryResult.recommendedSelector, value, timeout,
            stepId, failedCtx, retryResult
          );
        }

        // Fail after retry
        this._failStep(stepId, originalError, retryDecision);
        throw originalError;
      }

      if (decision.decision === 'apply' && recoveryResult.recommendedSelector) {
        return await this._applyHealedSelector(
          action, recoveryResult.recommendedSelector, value, timeout,
          stepId, failedCtx, recoveryResult
        );
      }

      // ── Decision: fail ──────────────────────────────────────────
      this._failStep(stepId, originalError, decision);
      throw originalError;
    }
  }

  /**
   * Apply a healed selector and validate.
   */
  async _applyHealedSelector(action, healedSelector, value, timeout, stepId, failedCtx, recoveryResult) {
    console.log(`[TestOrchestrator] Applying healed selector: ${healedSelector}`);

    try {
      await this._performAction(action, healedSelector, value, timeout);

      // ── Success! ────────────────────────────────────────────────
      eventBus.publish(
        createHealingEvent({
          type: 'selector_recovery_applied',
          testId: this.testId,
          stepId,
          payload: {
            originalSelector: failedCtx.originalSelector,
            healedSelector,
            confidence: recoveryResult.recommendedConfidence,
            source: recoveryResult.source,
          },
        })
      );

      // Persist to memory
      if (recoveryResult.candidates?.[0]) {
        this.selectorMemory.record(failedCtx, recoveryResult.candidates[0]);
      }

      // Screenshot after healing
      try {
        await this.screenshotTool.capture({
          testId: this.testId,
          stepId,
          phase: 'after_heal',
        });
      } catch { /* ignore */ }

      this.runContext.recordStep({ stepId, action, selector: healedSelector, result: 'healed' });
      this.runContext.recordUrl(this.page.url());
    } catch (healError) {
      console.error(`[TestOrchestrator] Healed selector also failed: ${healError.message}`);
      this.runContext.recordStep({ stepId, action, selector: healedSelector, result: 'fail' });
      throw healError;
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  FLOW RECOVERY
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Attempt flow-level recovery.
   * @param {string} stepId
   * @param {Object} ctx
   */
  async _attemptFlowRecovery(stepId, ctx) {
    const recentSteps = this.runContext
      .getRecentSteps()
      .map((s) => `${s.action} ${s.selector} → ${s.result}`);

    const plan = await this.flowAgent.recover({
      testId: this.testId,
      expectedState: ctx.expectedState,
      observedState: ctx.observedState,
      recentSteps,
      url: this.page.url(),
    });

    // Policy check
    const decision = this.policyEngine.evaluateFlowRecovery(plan, this.runContext);
    this.runContext.flowRecoveryAttempts++;

    this.runContext.recordHealingDecision({
      stepId,
      type: 'flow_recovery',
      decision: decision.decision,
      reason: decision.reason,
      confidence: decision.confidence,
      planId: plan.planId,
    });

    if (decision.decision === 'apply') {
      console.log(`[TestOrchestrator] Executing flow recovery plan: ${plan.planId}`);
      await this._executePlan(plan);

      eventBus.publish(
        createHealingEvent({
          type: 'flow_recovery_applied',
          testId: this.testId,
          stepId,
          payload: { plan },
        })
      );

      // Persist to flow memory
      this.flowMemory.record(
        { expectedState: ctx.expectedState, observedState: ctx.observedState, url: this.page.url() },
        plan
      );
    } else {
      throw new Error(
        `Flow recovery rejected by policy: ${decision.reason}`
      );
    }
  }

  /**
   * Execute a flow recovery plan (sequence of allowed actions).
   * @param {Object} plan – FlowRecoveryPlan
   */
  async _executePlan(plan) {
    for (const step of plan.actions) {
      console.log(`  ↳ ${step.action} ${step.target || ''} – ${step.rationale}`);
      const timeout = frameworkConfig.execution.actionTimeoutMs;

      switch (step.action) {
        case 'click':
        case 'dismissModal':
          await this._performAction('click', step.target, null, timeout);
          break;
        case 'fill':
          await this._performAction('fill', step.target, step.value, timeout);
          break;
        case 'waitForURL':
          await this.page.waitForURL(step.target, { timeout });
          break;
        case 'assertVisible':
          await this.page.locator(step.target).waitFor({ state: 'visible', timeout });
          break;
        default:
          throw new Error(`Unknown recovery action: ${step.action}`);
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  PLAYWRIGHT ACTION PRIMITIVES
  // ═══════════════════════════════════════════════════════════════════════

  /**
   * Perform a raw Playwright action.
   */
  async _performAction(action, selector, value, timeout) {
    const locator = this.page.locator(selector);

    switch (action) {
      case 'click':
        await locator.click({ timeout });
        break;
      case 'fill':
        await locator.fill(value, { timeout });
        break;
      case 'select':
        await locator.selectOption(value, { timeout });
        break;
      case 'assert':
        await locator.waitFor({ state: 'visible', timeout });
        break;
      default:
        throw new Error(`Unknown action: ${action}`);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  _nextStepId(action) {
    this._stepCounter++;
    return `${this.testId}-step-${this._stepCounter}-${action}`;
  }

  _failStep(stepId, error, decision) {
    console.error(
      `[TestOrchestrator] Step FAILED (policy: ${decision.decision}): ${decision.reason}`
    );
    this.runContext.recordStep({
      stepId,
      action: 'heal-rejected',
      selector: '',
      result: 'fail',
    });
  }
}

module.exports = TestOrchestrator;
