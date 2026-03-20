/**
 * @fileoverview Policy configuration for healing decisions.
 *
 * See design doc § 12 – Confidence and Decision Matrix and
 * § 13 – Policy and Safety Guardrails.
 */

const policyConfig = {
  // ─── Confidence Thresholds ────────────────────────────────────────────
  confidence: {
    /** >= this value → auto-heal in any mode */
    autoHealThreshold: 0.90,
    /** >= this value (and < autoHeal) → heal only in adaptive mode locally */
    mediumThreshold: 0.75,
    /** Below mediumThreshold → always fail-fast */
  },

  // ─── Retry Limits ─────────────────────────────────────────────────────
  retries: {
    /** Max selector recovery attempts per step */
    maxSelectorRetries: 2,
    /** Max flow recovery attempts per test */
    maxFlowRecoveries: 1,
  },

  // ─── Action Governance ────────────────────────────────────────────────
  actions: {
    /** Only these actions are allowed during recovery */
    allowlist: ['click', 'fill', 'assertVisible', 'waitForURL', 'dismissModal'],
    /** Never execute these during auto-healing */
    denylist: ['deleteAccount', 'dropDatabase', 'resetPassword', 'adminOverride'],
  },

  // ─── Mode Overrides ──────────────────────────────────────────────────
  modes: {
    /**
     * strict – used on main/CI:
     *   • no medium-confidence healing
     *   • fail-fast on uncertain recovery
     */
    strict: {
      allowMediumConfidence: false,
      allowFlowRecovery: false,
      failOnAnyHeal: false,
    },
    /**
     * adaptive – used on nightly/regression:
     *   • allow medium-confidence healing
     *   • collect recovery insights
     */
    adaptive: {
      allowMediumConfidence: true,
      allowFlowRecovery: true,
      failOnAnyHeal: false,
    },
  },
};

module.exports = policyConfig;
