/**
 * @fileoverview Selector Memory Store (long-term).
 *
 * Persists successful selector alternatives to a JSON file.
 * On subsequent failures, the orchestrator checks memory first
 * before invoking the AI agent, saving tokens and latency.
 *
 * Each entry has a decay score that decreases over runs,
 * so stale selectors naturally lose priority.
 *
 * See design doc § 8.7 – Memory Stores, Phase 3.
 */

const fs = require('fs');
const path = require('path');
const frameworkConfig = require('../../config/framework.config');

class SelectorMemoryStore {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.storePath]
   */
  constructor(opts = {}) {
    this.storePath = opts.storePath || frameworkConfig.memory.selectorStorePath;
    this.decayFactor = frameworkConfig.memory.decayFactor;
    /** @type {Object<string, Object[]>} key → selector entries */
    this._store = this._load();
  }

  /**
   * Build a lookup key from the failure context.
   * @param {Object} ctx – FailedStepContext (subset)
   * @returns {string}
   */
  _key(ctx) {
    return `${ctx.url}::${ctx.action}::${ctx.expectedTargetDescription}`;
  }

  /**
   * Look up previously successful selectors for a given failure.
   * Results are sorted by score (descending).
   *
   * @param {Object} ctx
   * @returns {Object[]} Array of { selector, strategy, confidence, lastUsed, score }
   */
  lookup(ctx) {
    const key = this._key(ctx);
    const entries = this._store[key] || [];
    return entries.sort((a, b) => b.score - a.score);
  }

  /**
   * Record a successful selector recovery.
   *
   * @param {Object} ctx – FailedStepContext
   * @param {Object} candidate – SelectorCandidate
   */
  record(ctx, candidate) {
    const key = this._key(ctx);
    if (!this._store[key]) {
      this._store[key] = [];
    }

    // Update existing or add new
    const existing = this._store[key].find((e) => e.selector === candidate.selector);
    if (existing) {
      existing.score = Math.min(1, existing.score + 0.1); // boost
      existing.lastUsed = new Date().toISOString();
      existing.timesUsed = (existing.timesUsed || 0) + 1;
    } else {
      this._store[key].push({
        selector: candidate.selector,
        strategy: candidate.strategy,
        confidence: candidate.confidence,
        score: candidate.confidence,
        lastUsed: new Date().toISOString(),
        timesUsed: 1,
      });
    }

    this._save();
  }

  /**
   * Apply decay to all entries. Call once per run.
   */
  applyDecay() {
    for (const key of Object.keys(this._store)) {
      this._store[key] = this._store[key]
        .map((e) => ({ ...e, score: e.score * this.decayFactor }))
        .filter((e) => e.score > 0.1); // prune very old entries
    }
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
      console.warn('[SelectorMemoryStore] Could not load store:', err.message);
    }
    return {};
  }

  _save() {
    try {
      const absPath = path.resolve(this.storePath);
      fs.mkdirSync(path.dirname(absPath), { recursive: true });
      fs.writeFileSync(absPath, JSON.stringify(this._store, null, 2), 'utf-8');
    } catch (err) {
      console.warn('[SelectorMemoryStore] Could not save store:', err.message);
    }
  }
}

module.exports = SelectorMemoryStore;
