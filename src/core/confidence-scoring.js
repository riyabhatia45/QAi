/**
 * @fileoverview Confidence Scoring utilities.
 *
 * Centralizes the logic for evaluating and adjusting confidence scores
 * before policy decisions are made.
 *
 * See design doc § 12 – Confidence and Decision Matrix.
 */

/**
 * Evaluate the effective confidence for a selector recovery result.
 *
 * Applies adjustments based on:
 *  - number of candidates returned
 *  - strategy quality (role > testid > label > css > xpath)
 *  - whether memory was the source
 *
 * @param {Object} result – SelectorRecoveryResult
 * @returns {number} Adjusted confidence (0–1)
 */
function evaluateSelectorConfidence(result) {
  let base = result.recommendedConfidence || 0;

  // Boost: if from memory with prior successes
  if (result.source === 'memory') {
    base = Math.min(1, base + 0.05);
  }

  // Boost: strategy quality
  const strategyBoosts = {
    role: 0.05,
    testid: 0.04,
    label: 0.03,
    css: 0.0,
    xpath: -0.02,
  };

  const top = result.candidates?.[0];
  if (top?.strategy && strategyBoosts[top.strategy] !== undefined) {
    base = Math.min(1, base + strategyBoosts[top.strategy]);
  }

  // Penalty: single candidate with low confidence
  if (result.candidates?.length === 1 && base < 0.7) {
    base -= 0.05;
  }

  return Math.max(0, Math.min(1, base));
}

/**
 * Evaluate the effective confidence for a flow recovery plan.
 *
 * Applies adjustments based on:
 *  - number of actions in the plan
 *  - action types (dismiss-only plans are safer)
 *
 * @param {Object} plan – FlowRecoveryPlan
 * @returns {number} Adjusted confidence (0–1)
 */
function evaluateFlowConfidence(plan) {
  let base = plan.confidence || 0;

  const actionCount = plan.actions?.length || 0;

  // Penalty for multi-step plans
  if (actionCount >= 3) {
    base -= 0.1;
  } else if (actionCount === 0) {
    return 0; // no actions = unrecoverable
  }

  // Boost: single dismissModal is very safe
  if (
    actionCount === 1 &&
    plan.actions[0]?.action === 'dismissModal'
  ) {
    base = Math.min(1, base + 0.05);
  }

  // Boost: from memory
  if (plan.source === 'memory') {
    base = Math.min(1, base + 0.05);
  }

  return Math.max(0, Math.min(1, base));
}

module.exports = {
  evaluateSelectorConfidence,
  evaluateFlowConfidence,
};
