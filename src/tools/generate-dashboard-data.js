const fs = require('fs');
const path = require('path');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, fallback = null) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_) {
    return fallback;
  }
}

function walk(dirPath, visit) {
  if (!fs.existsSync(dirPath)) {
    return;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath, visit);
    } else {
      visit(fullPath, entry.name);
    }
  }
}

function parseArgs(argv) {
  const args = {};

  for (let i = 2; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const value = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : 'true';
    args[key] = value;
  }

  return args;
}

function summarizeArtifact(reportPath, payload) {
  const events = payload.events || [];
  const testCompleted = events.find((event) => event.type === 'test_completed');

  return {
    runId: path.basename(path.dirname(reportPath)),
    runStartedAt: payload.runStartedAt || null,
    runFinishedAt: payload.runFinishedAt || null,
    totalEvents: payload.totalEvents || events.length,
    selectorHeals: events.filter((event) => event.type === 'selector_recovery_applied').length,
    flowHeals: events.filter((event) => event.type === 'flow_recovery_applied').length,
    failures: events.filter((event) => event.type === 'step_failed').length,
    healRejections: events.filter((event) => event.type === 'heal_rejected_by_policy').length,
    testsCompleted: events.filter((event) => event.type === 'test_completed').length,
    testId: testCompleted?.payload?.testId || testCompleted?.testId || null,
    totalSteps: testCompleted?.payload?.totalSteps || 0,
    totalSelectorRecoveries: testCompleted?.payload?.totalSelectorRecoveries || 0,
    totalFlowRecoveries: testCompleted?.payload?.totalFlowRecoveries || 0,
    urlsVisited: testCompleted?.payload?.urlsVisited || [],
    events,
    durationMs:
      payload.runStartedAt && payload.runFinishedAt
        ? new Date(payload.runFinishedAt).getTime() - new Date(payload.runStartedAt).getTime()
        : 0,
  };
}

function aggregateStats(runs) {
  const totalRuns = runs.length;
  const totalSelectorHeals = runs.reduce((sum, run) => sum + run.selectorHeals, 0);
  const totalFlowHeals = runs.reduce((sum, run) => sum + run.flowHeals, 0);
  const totalFailures = runs.reduce((sum, run) => sum + run.failures, 0);
  const totalTestsCompleted = runs.reduce((sum, run) => sum + run.testsCompleted, 0);
  const estimatedTimeSaved = ((totalSelectorHeals * 0.5) + (totalFlowHeals * 1.5)).toFixed(1);
  const denominator = totalSelectorHeals + totalFlowHeals + totalFailures;
  const healSuccessRate = denominator > 0
    ? (((totalSelectorHeals + totalFlowHeals) / denominator) * 100).toFixed(1)
    : '100.0';

  return {
    totalRuns,
    totalSelectorHeals,
    totalFlowHeals,
    totalFailures,
    totalTestsCompleted,
    estimatedTimeSaved,
    healSuccessRate,
    gitBranch: process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || 'local',
  };
}

function buildGitSnapshot() {
  const commit = process.env.GITHUB_SHA || '';
  const branch = process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || 'local';
  const actor = process.env.GITHUB_ACTOR || 'local';
  const eventName = process.env.GITHUB_EVENT_NAME || 'local';
  const runNumber = process.env.GITHUB_RUN_NUMBER || 'local';

  return {
    commits: commit
      ? [
          {
            hash: commit,
            author: actor,
            email: '',
            date: new Date().toISOString(),
            subject: `${eventName} run #${runNumber}`,
            refs: branch,
          },
        ]
      : [],
    status: {
      branch,
      changedFiles: [],
      diffStats: { added: 0, deleted: 0, files: 0 },
    },
    contributors: actor
      ? [{ commits: 1, name: actor, email: '' }]
      : [],
  };
}

function main() {
  const args = parseArgs(process.argv);
  const artifactsRoot = path.resolve(args.artifacts || args['artifacts-root'] || 'test-results');
  const outputDir = path.resolve(args.output || path.join('dashboard', 'public', 'data'));

  ensureDir(outputDir);

  const runs = [];
  const memoryCandidates = [];

  walk(artifactsRoot, (fullPath, fileName) => {
    if (fileName === 'healing-report.json') {
      const payload = readJson(fullPath);
      if (payload) {
        runs.push(summarizeArtifact(fullPath, payload));
      }
      return;
    }

    if (fileName === 'selector-memory.json') {
      const payload = readJson(fullPath, {});
      memoryCandidates.push({
        filePath: fullPath,
        payload,
        entryCount: Object.keys(payload || {}).length,
        mtimeMs: fs.statSync(fullPath).mtimeMs,
      });
    }
  });

  runs.sort((left, right) => new Date(right.runStartedAt || 0) - new Date(left.runStartedAt || 0));

  memoryCandidates.sort((left, right) => {
    if (right.entryCount !== left.entryCount) {
      return right.entryCount - left.entryCount;
    }
    return right.mtimeMs - left.mtimeMs;
  });

  const selectedMemory = memoryCandidates[0]?.payload || {};
  const stats = aggregateStats(runs);
  const git = buildGitSnapshot();

  const dashboardData = {
    generatedAt: new Date().toISOString(),
    mode: process.env.HEAL_MODE || 'adaptive',
    workflow: {
      name: process.env.GITHUB_WORKFLOW || 'local-dashboard-build',
      runNumber: process.env.GITHUB_RUN_NUMBER || null,
      runId: process.env.GITHUB_RUN_ID || null,
      event: process.env.GITHUB_EVENT_NAME || 'local',
      repository: process.env.GITHUB_REPOSITORY || null,
      branch: process.env.GITHUB_REF_NAME || process.env.GITHUB_HEAD_REF || 'local',
      sha: process.env.GITHUB_SHA || null,
      serverUrl: process.env.GITHUB_SERVER_URL || 'https://github.com',
    },
    stats,
    commits: git.commits,
    status: git.status,
    contributors: git.contributors,
    runs: runs.slice(0, 50),
    memory: selectedMemory,
  };

  fs.writeFileSync(
    path.join(outputDir, 'dashboard-data.json'),
    JSON.stringify(dashboardData, null, 2),
    'utf8'
  );

  fs.writeFileSync(
    path.join(outputDir, 'latest-run.json'),
    JSON.stringify(
      {
        generatedAt: dashboardData.generatedAt,
        workflow: dashboardData.workflow,
        stats: dashboardData.stats,
      },
      null,
      2
    ),
    'utf8'
  );

  console.log(`Dashboard data written to ${outputDir}`);
  console.log(JSON.stringify(dashboardData.stats, null, 2));
}

main();
