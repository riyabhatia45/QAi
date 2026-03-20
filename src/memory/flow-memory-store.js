/**
 * @fileoverview Flow Memory Store (long-term).
 *
 * Persists known flow detours and prior recovery plans.
 * When similar drift occurs again, the orchestrator can
 * replay a known-good plan instead of calling the AI.
 */

const fs = require('fs');
const path = require('path');
const frameworkConfig = require('../../config/framework.config');

class FlowMemoryStore {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.storePath]
   */
  constructor(opts = {}) {
    this.storePath = opts.storePath || frameworkConfig.memory.flowStorePath;
    /** @type {Object[]} */
    this._store = this._load();
  }

  /**
   * Look up previously successful flow recovery plans.
   *
   * @param {Object} ctx
   * @param {string} ctx.expectedState
   * @param {string} ctx.observedState
   * @param {string} ctx.url
   * @returns {Object|null} Best matching plan or null
   */
  lookup(ctx) {
    const matches = this._store.filter((entry) => {
      // Simple similarity: same URL + similar observed state
      const urlMatch = entry.url === ctx.url;
      const stateMatch =
        entry.observedState &&
        ctx.observedState &&
        entry.observedState.toLowerCase().includes(ctx.observedState.toLowerCase().substring(0, 20));
      return urlMatch && stateMatch;
    });

    if (matches.length === 0) return null;

    // Return highest-scored plan
    return matches.sort((a, b) => b.score - a.score)[0];
  }

  /**
   * Record a successful flow recovery.
   *
   * @param {Object} ctx - { expectedState, observedState, url }
   * @param {Object} plan - FlowRecoveryPlan
   */
  record(ctx, plan) {
    this._store.push({
      url: ctx.url,
      expectedState: ctx.expectedState,
      observedState: ctx.observedState,
      plan: plan,
      score: plan.confidence,
      recordedAt: new Date().toISOString(),
    });
    this._save();
  }

  // ─── Persistence ─────────────────────────────────────────────────────

  _load() {
    try {
      const absPath = path.resolve(this.storePath);
      if (fs.existsSync(absPath)) {
        return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
      }
    } catch (err) {
      console.warn('[FlowMemoryStore] Could not load store:', err.message);
    }
    return [];
  }

  _save() {
    try {
      const absPath = path.resolve(this.storePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, JSON.stringify(this._store, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[FlowMemoryStore] Could not save store:', err.message);
    }
  }
}

module.exports = FlowMemoryStore;
