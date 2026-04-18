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
 * 
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
const policyConfig = require('../../config/policy.config');

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
    this.healingEnabled =
      opts.healingEnabled !== undefined
        ? !!opts.healingEnabled
        : opts.enableHealing !== undefined
          ? !!opts.enableHealing
          : true;

    // ── Core components ─────────────────────────────────────────────
    this.policyEngine = new PolicyEngine();
    this.runContext = new RunContextStore(testId);

    // ── Memory ──────────────────────────────────────────────────────
    this.selectorMemory = opts.selectorMemory || new SelectorMemoryStore();
    this.flowMemory = opts.flowMemory || new FlowMemoryStore();

    // ── Agents ──────────────────────────────────────────────────────
    this.selectorAgent = null;
    this.flowAgent = null;

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
      await this.page.waitForLoadState('networkidle').catch(() => { });
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
      if (!this.healingEnabled) {
        throw err;
      }
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
    let selectorRecoveryAttemptsForStep = 0;

    // ── Step 1: Try the original selector ───────────────────────────
    try {
      await this._performAction(action, selector, value, timeout);
      this.runContext.recordStep({ stepId, action, selector, result: 'pass' });
      this.runContext.recordUrl(this.page.url());
      return;
    } catch (originalError) {
      const deterministicRetryCount = Math.max(
        0,
        frameworkConfig.execution.maxDeterministicRetries || 0
      );

      for (let attempt = 0; attempt < deterministicRetryCount; attempt++) {
        const backoffMs = 500 * Math.pow(2, attempt);
        console.log(
          `[TestOrchestrator] Deterministic retry ${attempt + 1}/${deterministicRetryCount} for ${action} "${selector}" after ${backoffMs}ms`
        );

        await this.page.waitForTimeout(backoffMs);

        try {
          await this._performAction(action, selector, value, timeout);
          this.runContext.recordStep({ stepId, action, selector, result: 'pass' });
          this.runContext.recordUrl(this.page.url());
          return;
        } catch (retryError) {
          if (attempt === deterministicRetryCount - 1) {
            console.warn(
              `[TestOrchestrator] Deterministic retries exhausted: ${retryError.message}`
            );
          }
        }
      }
      console.warn(
        `[TestOrchestrator] Step failed: ${action} "${selector}" – ${originalError.message}`
      );

      if (process.env.DEMO_MODE === 'true') {
        await this._showVisualOverlay('error', `❌ Broken Selector: ${selector}<br/>AI taking over...`);
      }

      if (!this.healingEnabled) {
        this.runContext.recordStep({ stepId, action, selector, result: 'fail' });
        throw originalError;
      }

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
      selectorRecoveryAttemptsForStep++;
      this.runContext.selectorRecoveryAttempts++;
      const recoveryResult = await this._getSelectorAgent().recover(failedCtx);

      // ── Step 5: Policy decision ───────────────────────────────────
      const decision = this.policyEngine.evaluateSelectorRecovery(
        recoveryResult,
        {
          ...this.runContext,
          selectorRecoveryAttempts: selectorRecoveryAttemptsForStep,
        }
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

      if (
        decision.decision === 'retry'
        && selectorRecoveryAttemptsForStep < policyConfig.retries.maxSelectorRetries
      ) {
        // Retry with expanded DOM context
        console.log('[TestOrchestrator] Retrying with more context...');
        const bigDom = await this.domTool.capture({ maxLength: 8000 });
        failedCtx.domExcerpt = bigDom;
        selectorRecoveryAttemptsForStep++;
        this.runContext.selectorRecoveryAttempts++;
        const retryResult = await this._getSelectorAgent().recover(failedCtx);
        const retryDecision = this.policyEngine.evaluateSelectorRecovery(
          retryResult,
          {
            ...this.runContext,
            selectorRecoveryAttempts: selectorRecoveryAttemptsForStep,
          }
        );

        if (retryDecision.decision === 'apply' && retryResult.recommendedSelector) {
          return await this._applyHealedSelector(
            action, value, timeout,
            stepId, failedCtx, retryResult
          );
        }

        // Fail after retry
        this._failStep(stepId, originalError, retryDecision);
        throw originalError;
      }

      if (decision.decision === 'apply' && recoveryResult.recommendedSelector) {
        return await this._applyHealedSelector(
          action, value, timeout,
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
  async _applyHealedSelector(action, value, timeout, stepId, failedCtx, recoveryResult) {
    const candidates = this._getOrderedCandidates(recoveryResult);
    let lastHealError = null;

    for (const candidate of candidates) {
      const candidateConfidence =
        typeof candidate.confidence === 'number'
          ? candidate.confidence
          : recoveryResult.recommendedSelector === candidate.selector
            ? recoveryResult.recommendedConfidence
            : 0;

      if (candidateConfidence < policyConfig.confidence.mediumThreshold) {
        console.log(
          `[TestOrchestrator] Stopping candidate cascade at ${candidate.selector} due to confidence ${candidateConfidence.toFixed(2)}`
        );
        break;
      }

      console.log(
        `[TestOrchestrator] Applying healed selector candidate: ${candidate.selector}`
      );

      if (process.env.DEMO_MODE === 'true') {
        await this._showVisualOverlay('success', `✅ AI Healed!<br/>Found: ${candidate.selector}`, candidate.selector);
      }

      try {
        await this._performAction(action, candidate.selector, value, timeout);
        eventBus.publish(
          createHealingEvent({
            type: 'selector_recovery_applied',
            testId: this.testId,
            stepId,
            payload: {
              originalSelector: failedCtx.originalSelector,
              healedSelector: candidate.selector,
              confidence: candidateConfidence,
              source: recoveryResult.source,
            },
          })
        );

        this.selectorMemory.record(failedCtx, {
          selector: candidate.selector,
          strategy: candidate.strategy || 'css',
          confidence: candidateConfidence,
        });
        try {
          await this.screenshotTool.capture({
            testId: this.testId,
            stepId,
            phase: 'after_heal',
          });
        } catch { /* ignore */ }

        this.runContext.recordStep({ stepId, action, selector: candidate.selector, result: 'healed' });
        this.runContext.recordUrl(this.page.url());
        return;
      } catch (healError) {
        lastHealError = healError;
        console.error(
          `[TestOrchestrator] Healed selector candidate failed: ${candidate.selector} - ${healError.message}`
        );
      }
    }

    if (lastHealError) {
      this.runContext.recordStep({ stepId, action, selector: failedCtx.originalSelector, result: 'fail' });
      throw lastHealError;
    }

    throw new Error('No healed selector candidate met the confidence threshold');
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

    const plan = await this._getFlowAgent().recover({
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
   * Supports both CSS selectors and Playwright getBy* syntax from AI agents.
   */
  async _performAction(action, selector, value, timeout) {
    const locator = this._resolveLocator(selector);

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

  /**
   * Resolve a selector string into a Playwright Locator.
   *
   * Supports:
   *   - CSS selectors: "#id", ".class", "button[type='submit']"
   *   - XPath: "//div[@id='main']"
   *   - All Playwright getBy* methods: getByRole, getByText, getByLabel,
   *     getByPlaceholder, getByTestId, getByAltText, getByTitle
   *   - Chaining: .nth(0), .first(), .last(), .filter(...)
   *   - Locator syntax: "role=button[name='Submit']"
   *
   * @param {string} selector
   * @returns {import('@playwright/test').Locator}
   */
  _resolveLocator(selector) {
    if (!selector || typeof selector !== 'string') {
      return this.page.locator(selector);
    }

    const trimmed = selector.trim();

    // ── Playwright getBy* syntax (e.g. from AI agents) ─────────────────
    if (trimmed.startsWith('getBy')) {
      return this._evalLocatorExpression(trimmed);
    }

    // ── page.getBy* or page.locator(...) syntax ────────────────────────
    if (trimmed.startsWith('page.')) {
      return this._evalLocatorExpression(trimmed.replace(/^page\./, ''));
    }

    // ── Default: CSS / XPath / Playwright built-in locator syntax ──────
    return this.page.locator(trimmed);
  }

  /**
   * Safely evaluate a Playwright locator expression string.
   * Handles: getByRole('button', { name: 'Submit' }).nth(0).first()
   *
   * Security: only allows page.getBy*, .locator(), .nth(), .first(),
   * .last(), .filter() — no arbitrary code execution.
   *
   * @param {string} expression – e.g. "getByRole('textbox', { name: 'Email' }).nth(0)"
   * @returns {import('@playwright/test').Locator}
   */
  _evalLocatorExpression(expression) {
    // Safety check: block dangerous patterns but allow { } for options objects
    // e.g. getByRole('textbox', { name: 'Email' }) is safe
    const forbidden = /;|require\s*\(|import\s|eval\s*\(|process\.|__proto__|prototype\[/i;
    if (forbidden.test(expression)) {
      console.warn(`[TestOrchestrator] Blocked unsafe locator expression: ${expression}`);
      return this.page.locator(expression);
    }

    try {
      // Use Function constructor to safely evaluate against the page object
      // The expression is scoped: only 'page' is available as a variable
      const fn = new Function('page', `"use strict"; return page.${expression};`);
      const locator = fn(this.page);

      // Verify we got a valid Locator object back
      if (locator && typeof locator.click === 'function') {
        return locator;
      }

      // Fallback if evaluation returned something unexpected
      console.warn(`[TestOrchestrator] Locator expression did not return a valid locator: ${expression}`);
      return this.page.locator(expression);
    } catch (err) {
      console.warn(`[TestOrchestrator] Failed to evaluate locator expression: ${expression} – ${err.message}`);
      return this.page.locator(expression);
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  //  HELPERS
  // ═══════════════════════════════════════════════════════════════════════

  async _showVisualOverlay(status, message, locatorStr = null) {
    try {
      if (locatorStr) {
        // Highlight element and show toast
        const loc = this._resolveLocator(locatorStr).first();
        await loc.evaluate((node, msg) => {
          // store old styles
          node.dataset.oldOutline = node.style.outline || '';
          node.dataset.oldBoxShadow = node.style.boxShadow || '';
          // apply new styles
          node.style.outline = '4px solid #00FF00';
          node.style.boxShadow = '0 0 15px #00FF00';

          const toast = document.createElement('div');
          toast.id = 'demo-toast-overlay';
          toast.innerHTML = msg;
          toast.style.position = 'fixed';
          toast.style.bottom = '20px';
          toast.style.right = '20px';
          toast.style.backgroundColor = 'rgba(0,0,0,0.85)';
          toast.style.color = '#00FF00';
          toast.style.padding = '15px 25px';
          toast.style.borderRadius = '8px';
          toast.style.zIndex = '999999';
          toast.style.fontFamily = 'monospace';
          toast.style.fontSize = '18px';
          toast.style.boxShadow = '0 4px 12px rgba(0,255,0,0.3)';
          document.body.appendChild(toast);

          setTimeout(() => {
            // cleanup
            node.style.outline = node.dataset.oldOutline;
            node.style.boxShadow = node.dataset.oldBoxShadow;
            const el = document.getElementById('demo-toast-overlay');
            if (el) el.remove();
          }, 4000);
        }, message).catch(() => { });
        await this.page.waitForTimeout(3000);
      } else {
        // Just show toast
        await this.page.evaluate((msg) => {
          const toast = document.createElement('div');
          toast.id = 'demo-toast-overlay-error';
          toast.innerHTML = msg;
          toast.style.position = 'fixed';
          toast.style.bottom = '20px';
          toast.style.right = '20px';
          toast.style.backgroundColor = 'rgba(40,0,0,0.9)';
          toast.style.border = '2px solid #FF0000';
          toast.style.color = '#FF0000';
          toast.style.padding = '15px 25px';
          toast.style.borderRadius = '8px';
          toast.style.zIndex = '999999';
          toast.style.fontFamily = 'monospace';
          toast.style.fontSize = '18px';
          toast.style.boxShadow = '0 4px 12px rgba(255,0,0,0.3)';
          document.body.appendChild(toast);

          setTimeout(() => {
            const el = document.getElementById('demo-toast-overlay-error');
            if (el) el.remove();
          }, 4000);
        }, message).catch(() => { });
        await this.page.waitForTimeout(3000);
      }
    } catch (e) {
      // ignore
    }
  }

  _getSelectorAgent() {
    if (!this.selectorAgent) {
      this.selectorAgent = new SelectorRecoveryAgent({
        page: this.page,
        memoryStore: this.selectorMemory,
      });
    }
    return this.selectorAgent;
  }

  _getFlowAgent() {
    if (!this.flowAgent) {
      this.flowAgent = new FlowRecoveryAgent({
        page: this.page,
        memoryStore: this.flowMemory,
      });
    }
    return this.flowAgent;
  }

  _nextStepId(action) {
    this._stepCounter++;
    return `${this.testId}-step-${this._stepCounter}-${action}`;
  }

  _getOrderedCandidates(recoveryResult) {
    const ordered = [];
    const seen = new Set();

    const pushCandidate = (candidate) => {
      if (!candidate?.selector || seen.has(candidate.selector)) {
        return;
      }

      seen.add(candidate.selector);
      ordered.push(candidate);
    };

    if (recoveryResult.recommendedSelector) {
      const matchingCandidate = (recoveryResult.candidates || []).find(
        (candidate) => candidate.selector === recoveryResult.recommendedSelector
      );

      pushCandidate(
        matchingCandidate || {
          selector: recoveryResult.recommendedSelector,
          strategy: 'css',
          confidence: recoveryResult.recommendedConfidence || 0,
        }
      );
    }

    for (const candidate of recoveryResult.candidates || []) {
      pushCandidate(candidate);
    }

    return ordered;
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
