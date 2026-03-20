/**
 * @fileoverview Policy Engine (Fallback Policy Engine).
 *
 * Enforces governance rules for every healing decision:
 *   • confidence thresholds
 *   • max retries
 *   • strict vs adaptive mode
 *   • action allowlist validation
 *
 * See design doc § 8.6 – PolicyEngine, § 13 – Policy and Safety Guardrails.
 */

const policyConfig = require('../../config/policy.config');
const frameworkConfig = require('../../config/framework.config');
const { evaluateSelectorConfidence, evaluateFlowConfidence } = require('./confidence-scoring');
const eventBus = require('../telemetry/event-bus');
const { createHealingEvent } = require('../types/contracts');

class PolicyEngine {
  constructor() {
    this.mode = frameworkConfig.execution.mode; // 'strict' | 'adaptive'
    this.modeConfig = policyConfig.modes[this.mode] || policyConfig.modes.adaptive;
  }

  /**
   * Decide whether a selector recovery result should be applied.
   *
   * @param {Object} result – SelectorRecoveryResult (from agent)
   * @param {Object} runCtx – RunContextStore
   * @returns {{ decision: 'apply'|'retry'|'fail', reason: string, confidence: number }}
   */
  evaluateSelectorRecovery(result, runCtx) {
    const confidence = evaluateSelectorConfidence(result);

    // ── Check retry budget ─────────────────────────────────────────
    if (runCtx.selectorRecoveryAttempts >= policyConfig.retries.maxSelectorRetries) {
      const decision = {
        decision: 'fail',
        reason: `Max selector retries (${policyConfig.retries.maxSelectorRetries}) exhausted`,
        confidence,
      };
      this._emitRejection(runCtx.testId, result, decision);
      return decision;
    }

    // ── Should retry with more context? ────────────────────────────
    if (result.shouldRetryWithMoreContext && confidence < policyConfig.confidence.autoHealThreshold) {
      return {
        decision: 'retry',
        reason: 'Agent requested more context and confidence is below auto-heal threshold',
        confidence,
      };
    }

    // ── High confidence → auto-heal ────────────────────────────────
    if (confidence >= policyConfig.confidence.autoHealThreshold) {
      return {
        decision: 'apply',
        reason: `High confidence (${confidence.toFixed(2)}) – auto-heal allowed`,
        confidence,
      };
    }

    // ── Medium confidence ──────────────────────────────────────────
    if (confidence >= policyConfig.confidence.mediumThreshold) {
      if (this.modeConfig.allowMediumConfidence) {
        return {
          decision: 'apply',
          reason: `Medium confidence (${confidence.toFixed(2)}) – adaptive mode allows healing`,
          confidence,
        };
      }
      const decision = {
        decision: 'fail',
        reason: `Medium confidence (${confidence.toFixed(2)}) – strict mode rejects`,
        confidence,
      };
      this._emitRejection(runCtx.testId, result, decision);
      return decision;
    }

    // ── Low confidence → always fail ───────────────────────────────
    const decision = {
      decision: 'fail',
      reason: `Low confidence (${confidence.toFixed(2)}) – requires human review`,
      confidence,
    };
    this._emitRejection(runCtx.testId, result, decision);
    return decision;
  }

  /**
   * Decide whether a flow recovery plan should be executed.
   *
   * @param {Object} plan – FlowRecoveryPlan (from agent)
   * @param {Object} runCtx – RunContextStore
   * @returns {{ decision: 'apply'|'fail', reason: string, confidence: number }}
   */
  evaluateFlowRecovery(plan, runCtx) {
    const confidence = evaluateFlowConfidence(plan);

    // ── Check if flow recovery is allowed in this mode ─────────────
    if (!this.modeConfig.allowFlowRecovery) {
      const decision = {
        decision: 'fail',
        reason: `Flow recovery disabled in ${this.mode} mode`,
        confidence,
      };
      this._emitRejection(runCtx.testId, plan, decision);
      return decision;
    }

    // ── Check retry budget ─────────────────────────────────────────
    if (runCtx.flowRecoveryAttempts >= policyConfig.retries.maxFlowRecoveries) {
      const decision = {
        decision: 'fail',
        reason: `Max flow recoveries (${policyConfig.retries.maxFlowRecoveries}) exhausted`,
        confidence,
      };
      this._emitRejection(runCtx.testId, plan, decision);
      return decision;
    }

    // ── Validate actions are all in allowlist ──────────────────────
    const invalidActions = (plan.actions || []).filter(
      (a) => !policyConfig.actions.allowlist.includes(a.action)
    );
    if (invalidActions.length > 0) {
      const decision = {
        decision: 'fail',
        reason: `Plan contains disallowed actions: ${invalidActions.map((a) => a.action).join(', ')}`,
        confidence,
      };
      this._emitRejection(runCtx.testId, plan, decision);
      return decision;
    }

    // ── Check against denylist ─────────────────────────────────────
    const deniedActions = (plan.actions || []).filter(
      (a) => policyConfig.actions.denylist.includes(a.action)
    );
    if (deniedActions.length > 0) {
      const decision = {
        decision: 'fail',
        reason: `Plan contains denied actions: ${deniedActions.map((a) => a.action).join(', ')}`,
        confidence,
      };
      this._emitRejection(runCtx.testId, plan, decision);
      return decision;
    }

    // ── Confidence check ───────────────────────────────────────────
    if (confidence >= policyConfig.confidence.mediumThreshold) {
      return {
        decision: 'apply',
        reason: `Flow recovery confidence (${confidence.toFixed(2)}) meets threshold`,
        confidence,
      };
    }

    const decision = {
      decision: 'fail',
      reason: `Flow recovery confidence (${confidence.toFixed(2)}) too low`,
      confidence,
    };
    this._emitRejection(runCtx.testId, plan, decision);
    return decision;
  }

  // ─── Internal ────────────────────────────────────────────────────────

  _emitRejection(testId, payload, decision) {
    eventBus.publish(
      createHealingEvent({
        type: 'heal_rejected_by_policy',
        testId,
        payload: { decision, originalPayload: payload },
      })
    );
  }
}

module.exports = PolicyEngine;
