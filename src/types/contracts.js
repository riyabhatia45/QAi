/**
 * @fileoverview Data contracts for the Agentic Playwright Framework.
 *
 * These factory functions create well-shaped objects matching the
 * interfaces described in the design document (§ 9 – Data Contracts).
 */

// ─── Failed Step Context ────────────────────────────────────────────────────

/**
 * Creates a FailedStepContext object.
 * @param {Object} opts
 * @param {string} opts.testId
 * @param {string} opts.stepId
 * @param {'click'|'fill'|'select'|'assert'} opts.action
 * @param {string} opts.expectedTargetDescription
 * @param {string} [opts.originalSelector]
 * @param {string} opts.url
 * @param {string} opts.domExcerpt
 * @param {string} opts.axTreeExcerpt
 * @param {string} [opts.screenshotPath]
 * @param {string} opts.errorMessage
 * @returns {Object}
 */
function createFailedStepContext(opts) {
  return {
    testId: opts.testId,
    stepId: opts.stepId,
    action: opts.action,
    expectedTargetDescription: opts.expectedTargetDescription,
    originalSelector: opts.originalSelector || null,
    url: opts.url,
    domExcerpt: opts.domExcerpt,
    axTreeExcerpt: opts.axTreeExcerpt,
    screenshotPath: opts.screenshotPath || null,
    errorMessage: opts.errorMessage,
  };
}

// ─── Selector Candidate ────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {string} opts.selector
 * @param {'role'|'label'|'testid'|'css'|'xpath'} opts.strategy
 * @param {number} opts.confidence - 0 to 1
 * @param {string} opts.rationale
 * @returns {Object}
 */
function createSelectorCandidate(opts) {
  return {
    selector: opts.selector,
    strategy: opts.strategy,
    confidence: opts.confidence,
    rationale: opts.rationale,
  };
}

// ─── Selector Recovery Result ───────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {Object[]} opts.candidates
 * @param {string} [opts.recommendedSelector]
 * @param {number} opts.recommendedConfidence
 * @param {boolean} opts.shouldRetryWithMoreContext
 * @returns {Object}
 */
function createSelectorRecoveryResult(opts) {
  return {
    candidates: opts.candidates || [],
    recommendedSelector: opts.recommendedSelector || null,
    recommendedConfidence: opts.recommendedConfidence,
    shouldRetryWithMoreContext: !!opts.shouldRetryWithMoreContext,
  };
}

// ─── Flow Recovery Action ───────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {'click'|'fill'|'waitForURL'|'assertVisible'|'dismissModal'} opts.action
 * @param {string} [opts.target]
 * @param {string} [opts.value]
 * @param {string} opts.rationale
 * @returns {Object}
 */
function createFlowRecoveryAction(opts) {
  return {
    action: opts.action,
    target: opts.target || null,
    value: opts.value || null,
    rationale: opts.rationale,
  };
}

// ─── Flow Recovery Plan ─────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {string} opts.planId
 * @param {number} opts.confidence
 * @param {Object[]} opts.actions
 * @param {string} opts.expectedStateAfterPlan
 * @returns {Object}
 */
function createFlowRecoveryPlan(opts) {
  return {
    planId: opts.planId,
    confidence: opts.confidence,
    actions: opts.actions || [],
    expectedStateAfterPlan: opts.expectedStateAfterPlan,
  };
}

// ─── Healing Event ──────────────────────────────────────────────────────────

/**
 * @param {Object} opts
 * @param {'step_failed'|'selector_recovery_invoked'|'selector_recovery_applied'|'flow_recovery_invoked'|'flow_recovery_applied'|'heal_rejected_by_policy'|'test_completed'} opts.type
 * @param {string} opts.testId
 * @param {string} [opts.stepId]
 * @param {Object} [opts.payload]
 * @param {string} [opts.timestamp]
 * @returns {Object}
 */
function createHealingEvent(opts) {
  return {
    type: opts.type,
    testId: opts.testId,
    stepId: opts.stepId || null,
    payload: opts.payload || {},
    timestamp: opts.timestamp || new Date().toISOString(),
  };
}

module.exports = {
  createFailedStepContext,
  createSelectorCandidate,
  createSelectorRecoveryResult,
  createFlowRecoveryAction,
  createFlowRecoveryPlan,
  createHealingEvent,
};
