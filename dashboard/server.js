/**
 * Dashboard Server – Real-Time Git & Healing Monitor
 * Self-Healing Playwright Framework
 *
 * Endpoints:
 *   GET /api/git     → commits, branch status, diff stats, contributors
 *   GET /api/healing → parsed healing artifacts
 *   GET /api/memory  → selector-memory.json
 *   GET /api/stats   → aggregate healing metrics
 *   GET /events      → SSE stream for live updates
 */

const http    = require('http');
const fs      = require('fs');
const path    = require('path');
const { execSync } = require('child_process');

const PORT          = 4000;
const ROOT          = path.resolve(__dirname, '..');
const ARTIFACTS_DIR = path.join(ROOT, 'test-results', 'healing-artifacts');
const MEMORY_FILE   = path.join(ROOT, 'test-results', 'selector-memory.json');

// ─── SSE ──────────────────────────────────────────────────────────────────────
const sseClients = new Set();
function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of sseClients) {
    try { res.write(msg); } catch (_) { sseClients.delete(res); }
  }
}

// ─── Git helpers ──────────────────────────────────────────────────────────────
function getGitLog(n = 40) {
  try {
    const raw = execSync(
      `git -C "${ROOT}" log --pretty=format:"%H|||%an|||%ae|||%ad|||%s|||%D" --date=iso -${n}`,
      { encoding: 'utf8', timeout: 8000 }
    );
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const [hash, author, email, date, subject, refs] = line.split('|||');
      return { hash: hash?.trim(), author: author?.trim(), email: email?.trim(), date: date?.trim(), subject: subject?.trim(), refs: refs?.trim() };
    });
  } catch (_) { return []; }
}

function getGitStatus() {
  try {
    const branch   = execSync(`git -C "${ROOT}" rev-parse --abbrev-ref HEAD`, { encoding: 'utf8', timeout: 4000 }).trim();
    const statusRaw = execSync(`git -C "${ROOT}" status --short`, { encoding: 'utf8', timeout: 4000 });
    const changedFiles = statusRaw.trim().split('\n').filter(Boolean).map(l => ({ status: l.slice(0, 2).trim(), file: l.slice(3).trim() }));
    let diffStats = { added: 0, deleted: 0, files: 0 };
    try {
      const dr = execSync(`git -C "${ROOT}" diff --stat HEAD`, { encoding: 'utf8', timeout: 5000 });
      const last = dr.trim().split('\n').pop() || '';
      const fm = last.match(/(\d+) file/), am = last.match(/(\d+) insertion/), dm = last.match(/(\d+) deletion/);
      diffStats = { files: fm ? +fm[1] : 0, added: am ? +am[1] : 0, deleted: dm ? +dm[1] : 0 };
    } catch (_) {}
    return { branch, changedFiles, diffStats };
  } catch (_) { return { branch: 'unknown', changedFiles: [], diffStats: { added: 0, deleted: 0, files: 0 } }; }
}

function getGitContributors() {
  try {
    const raw = execSync(`git -C "${ROOT}" shortlog -sne --all`, { encoding: 'utf8', timeout: 6000 });
    return raw.trim().split('\n').filter(Boolean).map(line => {
      const m = line.match(/^\s*(\d+)\s+(.+?)\s+<(.+?)>/);
      return m ? { commits: +m[1], name: m[2], email: m[3] } : null;
    }).filter(Boolean).slice(0, 10);
  } catch (_) { return []; }
}

// ─── Healing Artifact helpers ─────────────────────────────────────────────────
function parseHealingArtifacts() {
  const results = [];
  if (!fs.existsSync(ARTIFACTS_DIR)) return results;
  for (const dir of fs.readdirSync(ARTIFACTS_DIR)) {
    const jsonFile = path.join(ARTIFACTS_DIR, dir, 'healing-report.json');
    if (!fs.existsSync(jsonFile)) continue;
    try {
      const data = JSON.parse(fs.readFileSync(jsonFile, 'utf8'));
      const events = data.events || [];
      results.push({
        runId: dir,
        runStartedAt: data.runStartedAt,
        runFinishedAt: data.runFinishedAt,
        totalEvents: data.totalEvents,
        selectorHeals: events.filter(e => e.type === 'selector_recovery_applied').length,
        flowHeals:     events.filter(e => e.type === 'flow_recovery_applied').length,
        failures:      events.filter(e => e.type === 'step_failed').length,
        testsCompleted:events.filter(e => e.type === 'test_completed').length,
        events,
        durationMs: data.runStartedAt && data.runFinishedAt
          ? new Date(data.runFinishedAt) - new Date(data.runStartedAt) : 0,
      });
    } catch (_) {}
  }
  return results.sort((a, b) => new Date(b.runStartedAt || 0) - new Date(a.runStartedAt || 0));
}

function getSelectorMemory() {
  if (!fs.existsSync(MEMORY_FILE)) return {};
  try { return JSON.parse(fs.readFileSync(MEMORY_FILE, 'utf8')); } catch (_) { return {}; }
}

function aggregateStats(artifacts) {
  const totalSelectorHeals = artifacts.reduce((a, r) => a + r.selectorHeals, 0);
  const totalFlowHeals     = artifacts.reduce((a, r) => a + r.flowHeals, 0);
  const totalFailures      = artifacts.reduce((a, r) => a + r.failures, 0);
  const totalRuns          = artifacts.length;
  const estimatedTimeSaved = ((totalSelectorHeals * 0.5) + (totalFlowHeals * 1.5)).toFixed(1);
  const healSuccessRate    = totalFailures + totalSelectorHeals + totalFlowHeals > 0
    ? (((totalSelectorHeals + totalFlowHeals) / (totalFailures + totalSelectorHeals + totalFlowHeals)) * 100).toFixed(1)
    : '100';
  return { totalRuns, totalSelectorHeals, totalFlowHeals, totalFailures, estimatedTimeSaved, healSuccessRate };
}

// ─── Static files ─────────────────────────────────────────────────────────────
const MIME = { '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css', '.json': 'application/json' };
function serveStatic(res, filePath) {
  const ext = path.extname(filePath);
  if (fs.existsSync(filePath)) {
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'text/plain',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
    fs.createReadStream(filePath).pipe(res);
  } else { res.writeHead(404); res.end('Not found'); }
}

// ─── Router ───────────────────────────────────────────────────────────────────
async function router(req, res) {
  const url = new URL(req.url, `http://localhost:${PORT}`);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (url.pathname === '/' || url.pathname === '/index.html')
    return serveStatic(res, path.join(__dirname, 'public', 'index.html'));

  // SSE
  if (url.pathname === '/events') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
    res.write(`event: connected\ndata: ${JSON.stringify({ ts: new Date().toISOString() })}\n\n`);
    sseClients.add(res);
    req.on('close', () => sseClients.delete(res));
    return;
  }

  const json = (data) => { 
    res.writeHead(200, { 
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0'
    }); 
    res.end(JSON.stringify(data)); 
  };

  if (url.pathname === '/api/git') {
    const commits = getGitLog(40);
    const status = getGitStatus();
    const contributors = getGitContributors();
    return json({ commits, status, contributors });
  }

  if (url.pathname === '/api/healing') {
    const artifacts = parseHealingArtifacts();
    return json({ runs: artifacts.slice(0, 20) });
  }

  if (url.pathname === '/api/memory') return json(getSelectorMemory());

  if (url.pathname === '/api/stats') {
    const artifacts = parseHealingArtifacts();
    const stats = aggregateStats(artifacts);
    const status = getGitStatus();
    return json({ ...stats, gitBranch: status.branch });
  }

  res.writeHead(404); res.end('Not found');
}

// ─── Polling: push SSE on changes ─────────────────────────────────────────────
let lastCommitHash = null, lastArtifactCount = 0;

async function poll() {
  // Git changes
  try {
    const commits = getGitLog(1);
    if (commits.length && commits[0].hash !== lastCommitHash) {
      lastCommitHash = commits[0].hash;
      broadcast('git_update', { latest: commits[0], ts: new Date().toISOString() });
    }
  } catch (_) {}

  // Healing artifacts
  try {
    if (fs.existsSync(ARTIFACTS_DIR)) {
      const count = fs.readdirSync(ARTIFACTS_DIR).length;
      if (count !== lastArtifactCount) {
        lastArtifactCount = count;
        const stats = aggregateStats(parseHealingArtifacts());
        broadcast('healing_update', { stats, ts: new Date().toISOString() });
      }
    }
  } catch (_) {}
}

setInterval(poll, 10000);   // poll every 10s

// ─── Start ────────────────────────────────────────────────────────────────────
const server = http.createServer((req, res) => {
  router(req, res).catch(err => {
    console.error('[Dashboard]', err.message);
    if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
  });
});

server.listen(PORT, () => {
  console.log(`\n🚀  Self-Healing Dashboard Running → http://localhost:${PORT}`);
  console.log(`📡  Tracking Local Git & Healing Artifacts...`);
  console.log(`(Press Ctrl+C to stop)\n`);
});
