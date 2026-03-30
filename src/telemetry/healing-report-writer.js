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

    // ── HTML Dashboard ──────────────────────────────────────────────
    const htmlPath = path.join(dirPath, 'healing-dashboard.html');
    const html = this._buildHTML(jsonPayload);
    fs.writeFileSync(htmlPath, html, 'utf-8');

    console.log(`[HealingReportWriter] Premium Dashboard generated at ${htmlPath}`);
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

  // ─── HTML Dashboard Builder ──────────────────────────────────────────

  /**
   * Generates a premium HTML dashboard with ROI metrics and visual healing traces.
   */
  _buildHTML(payload) {
    const selectorHeals = payload.events.filter(e => e.type === 'selector_recovery_applied');
    const flowHeals = payload.events.filter(e => e.type === 'flow_recovery_applied');
    
    // ROI Logic: Each selector heal saves ~30 mins, Flow heal saves ~1.5 hours
    const estimatedSavingsHours = (selectorHeals.length * 0.5) + (flowHeals.length * 1.5);
    const totalTokens = payload.events.reduce((acc, e) => acc + (e.payload?.tokensUsed || 0), 0);
    const estimatedAICost = (totalTokens / 1000) * 0.002; 

    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Agentic Healing Dashboard</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap" rel="stylesheet">
    <style>
        :root { --bg: #0f172a; --card: #1e293b; --primary: #38bdf8; --success: #22c55e; --danger: #ef4444; --text: #f8fafc; --text-dim: #94a3b8; }
        body { font-family: 'Inter', sans-serif; background: var(--bg); color: var(--text); margin: 0; padding: 2rem; }
        .container { max-width: 1100px; margin: 0 auto; }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 2rem; }
        .roi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1.5rem; margin-bottom: 3rem; }
        .roi-card { background: var(--card); padding: 1.5rem; border-radius: 1rem; border: 1px solid rgba(255,255,255,0.05); text-align: center; }
        .roi-val { font-size: 2rem; font-weight: 800; color: var(--primary); display: block; }
        .roi-label { color: var(--text-dim); font-size: 0.75rem; text-transform: uppercase; }
        .event-card { background: var(--card); border-radius: 1rem; padding: 1.25rem; margin-bottom: 1rem; border-left: 4px solid var(--text-dim); }
        .healed { border-left-color: var(--success); }
        .trace { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; background: rgba(0,0,0,0.2); padding: 1rem; border-radius: 0.5rem; margin-top: 1rem; }
        .old { color: var(--danger); text-decoration: line-through; font-family: monospace; }
        .new { color: var(--success); font-family: monospace; font-weight: bold; }
        .badge { background: rgba(255,255,255,0.1); padding: 0.2rem 0.6rem; border-radius: 4px; font-size: 0.7rem; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div><h1>🩹 Healing Dashboard</h1><p style="color:var(--text-dim)">Showcasing Agentic Resilience</p></div>
            <div class="badge">RUN: ${new Date(payload.runStartedAt).toLocaleString()}</div>
        </div>
        <div class="roi-grid">
            <div class="roi-card"><span class="roi-val">${selectorHeals.length + flowHeals.length}</span><span class="roi-label">Repairs Performed</span></div>
            <div class="roi-card"><span class="roi-val">${estimatedSavingsHours}h</span><span class="roi-label">Time Saved (Est.)</span></div>
            <div class="roi-card"><span class="roi-val">$${estimatedAICost.toFixed(4)}</span><span class="roi-label">AI Cost</span></div>
            <div class="roi-card"><span class="roi-val">${totalTokens}</span><span class="roi-label">Tokens Used</span></div>
        </div>
        ${payload.events.map(evt => `
            <div class="event-card ${evt.type.includes('applied') ? 'healed' : ''}">
                <div style="font-size:0.75rem; color:var(--text-dim)">${new Date(evt.timestamp).toLocaleTimeString()} • ${evt.testId || 'System'}</div>
                <div style="font-weight:600; margin-top:0.25rem">${evt.type.replace(/_/g, ' ')}</div>
                ${evt.payload?.originalSelector ? `
                    <div class="trace">
                        <div><div class="roi-label">Original</div><div class="old">${evt.payload.originalSelector}</div></div>
                        <div><div class="roi-label">Healed</div><div class="new">${evt.payload.healedSelector}</div></div>
                    </div>
                ` : ''}
            </div>
        `).join('')}
    </div>
</body>
</html>`;
  }

  /** Reset state between runs. */
  reset() {
    this._reports = [];
    this._startTime = new Date().toISOString();
  }
}

module.exports = HealingReportWriter;
