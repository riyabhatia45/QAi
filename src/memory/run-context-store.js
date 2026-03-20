/**
 * @fileoverview Run Context Store (short-term, per-test).
 *
 * Holds ephemeral state for the current test run:
 *   • step history
 *   • recent URLs visited
 *   • healing attempts made so far
 *
 * Destroyed at the end of each test.
 */

class RunContextStore {
  /**
   * @param {string} testId
   */
  constructor(testId) {
    this.testId = testId;
    this.startedAt = new Date().toISOString();

    /** @type {Object[]} Ordered list of steps executed */
    this.stepHistory = [];

    /** @type {string[]} URLs visited during the test */
    this.urlHistory = [];

    /** @type {number} Selector recovery attempts in this run */
    this.selectorRecoveryAttempts = 0;

    /** @type {number} Flow recovery attempts in this run */
    this.flowRecoveryAttempts = 0;

    /** @type {Object[]} All healing decisions made */
    this.healingDecisions = [];
  }

  /**
   * Record a step execution.
   * @param {Object} step
   * @param {string} step.stepId
   * @param {string} step.action
   * @param {string} step.selector
   * @param {'pass'|'fail'|'healed'} step.result
   */
  recordStep(step) {
    this.stepHistory.push({
      ...step,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Record a URL visit.
   * @param {string} url
   */
  recordUrl(url) {
    if (this.urlHistory[this.urlHistory.length - 1] !== url) {
      this.urlHistory.push(url);
    }
  }

  /**
   * Record a healing decision.
   * @param {Object} decision
   */
  recordHealingDecision(decision) {
    this.healingDecisions.push({
      ...decision,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Get the last N steps (for flow recovery context).
   * @param {number} [n=5]
   * @returns {Object[]}
   */
  getRecentSteps(n = 5) {
    return this.stepHistory.slice(-n);
  }

  /**
   * Export a summary of the run context.
   * @returns {Object}
   */
  toSummary() {
    return {
      testId: this.testId,
      startedAt: this.startedAt,
      totalSteps: this.stepHistory.length,
      totalSelectorRecoveries: this.selectorRecoveryAttempts,
      totalFlowRecoveries: this.flowRecoveryAttempts,
      urlsVisited: this.urlHistory,
      healingDecisions: this.healingDecisions,
    };
  }
}

module.exports = RunContextStore;
