/**
 * @fileoverview Healing Report Writer.
 *
 * Produces human-readable (.md) and machine-readable (.json) artifacts
 * for every healing event that occurs during a test run.
 *
 * See design doc § 8.8 – HealingReportWriter and § 14 – Observability.
 */

const fs = require('fs');
const path = require('path');
const frameworkConfig = require('../../config/framework.config');
const eventBus = require('./event-bus');

class HealingReportWriter {
  /**
   * @param {Object} [opts]
   * @param {string} [opts.outputDir]
   */
  constructor(opts = {}) {
    this.outputDir = opts.outputDir || frameworkConfig.artifacts.outputDir;
    this._reports = [];
    this._startTime = new Date().toISOString();
    this._listenToEvents();
  }

  // ─── Event Listeners ─────────────────────────────────────────────────

  _listenToEvents() {
    eventBus.on('*', (event) => {
      this._reports.push(event);
    });
  }

  // ─── Public API ──────────────────────────────────────────────────────

  /**
   * Add a healing record manually (selector or flow recovery).
   * @param {Object} record
   */
  addRecord(record) {
    this._reports.push({
      ...record,
      timestamp: record.timestamp || new Date().toISOString(),
    });
  }

  /**
   * Write all collected reports to disk.
   * @param {string} [testId] - optional test identifier for the filename
   */
  async flush(testId) {
    const slug = testId ? testId.replace(/[^a-zA-Z0-9_-]/g, '_') : 'run';
    const ts = new Date().toISOString().replace(/[:.]/g, '-');
    const dirPath = path.resolve(this.outputDir, `${slug}_${ts}`);

    fs.mkdirSync(dirPath, { recursive: true });

    // ── JSON report ──────────────────────────────────────────────────
    const jsonPath = path.join(dirPath, 'healing-report.json');
    const jsonPayload = {
      framework: 'agentic-playwright',
      runStartedAt: this._startTime,
      runFinishedAt: new Date().toISOString(),
      totalEvents: this._reports.length,
      events: this._reports,
    };
    fs.writeFileSync(jsonPath, JSON.stringify(jsonPayload, null, 2), 'utf-8');

    // ── Markdown report ──────────────────────────────────────────────
    const mdPath = path.join(dirPath, 'healing-report.md');
    const md = this._buildMarkdown(jsonPayload);
    fs.writeFileSync(mdPath, md, 'utf-8');

    console.log(`[HealingReportWriter] Reports written to ${dirPath}`);
    return dirPath;
  }

  // ─── Markdown Builder ────────────────────────────────────────────────

  _buildMarkdown(payload) {
    const lines = [
      '# 🩹 Healing Report',
      '',
      `**Run started:** ${payload.runStartedAt}`,
      `**Run finished:** ${payload.runFinishedAt}`,
      `**Total events:** ${payload.totalEvents}`,
      '',
      '---',
      '',
    ];

    const selectorHeals = payload.events.filter(
      (e) => e.type === 'selector_recovery_applied'
    );
    const flowHeals = payload.events.filter(
      (e) => e.type === 'flow_recovery_applied'
    );
    const rejections = payload.events.filter(
      (e) => e.type === 'heal_rejected_by_policy'
    );

    lines.push('## Summary');
    lines.push('');
    lines.push(`| Metric | Count |`);
    lines.push(`|--------|------:|`);
    lines.push(`| Selector heals applied | ${selectorHeals.length} |`);
    lines.push(`| Flow heals applied | ${flowHeals.length} |`);
    lines.push(`| Heals rejected by policy | ${rejections.length} |`);
    lines.push('');

    if (payload.events.length > 0) {
      lines.push('## Event Timeline');
      lines.push('');
      for (const evt of payload.events) {
        lines.push(`### ${evt.timestamp} — \`${evt.type}\``);
        lines.push('');
        lines.push(`- **Test:** ${evt.testId || 'N/A'}`);
        lines.push(`- **Step:** ${evt.stepId || 'N/A'}`);
        if (evt.payload) {
          lines.push('');
          lines.push('```json');
          lines.push(JSON.stringify(evt.payload, null, 2));
          lines.push('```');
        }
        lines.push('');
      }
    }

    return lines.join('\n');
  }

  /** Reset state between runs. */
  reset() {
    this._reports = [];
    this._startTime = new Date().toISOString();
  }
}

module.exports = HealingReportWriter;
