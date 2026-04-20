const fs = require('fs');
const path = require('path');
const os = require('os');
const { spawn } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
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
      visit(fullPath, entry);
    }
  }
}

function parseArgs(argv) {
  const args = {};

  for (let index = 2; index < argv.length; index++) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? argv[++index] : 'true';
  }

  return args;
}

function getInputVideos(inputDir) {
  const videos = [];

  walk(inputDir, (fullPath, entry) => {
    if (entry.name === 'video.webm' || fullPath.endsWith('.webm')) {
      const stats = fs.statSync(fullPath);
      videos.push({
        fullPath,
        mtimeMs: stats.mtimeMs,
      });
    }
  });

  return videos.sort((left, right) => left.mtimeMs - right.mtimeMs);
}

function runFfmpeg(args) {
  return new Promise((resolve, reject) => {
    const child = spawn(ffmpeg.path, args, {
      stdio: 'inherit',
      windowsHide: true,
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

async function main() {
  const args = parseArgs(process.argv);
  const inputDir = path.resolve(args.input || path.join('test-results', 'playwright-artifacts'));
  const outputPath = path.resolve(args.output || path.join('test-results', 'run-videos', 'retail-suite-combined.webm'));
  ensureDir(path.dirname(outputPath));

  const videos = getInputVideos(inputDir);
  if (!videos.length) {
    throw new Error(`No Playwright video files found in ${inputDir}`);
  }

  const concatFile = path.join(os.tmpdir(), `playwright-video-merge-${Date.now()}.txt`);
  fs.writeFileSync(
    concatFile,
    videos.map((video) => `file '${video.fullPath.replace(/'/g, "'\\''")}'`).join('\n'),
    'utf8'
  );

  try {
    await runFfmpeg([
      '-y',
      '-f',
      'concat',
      '-safe',
      '0',
      '-i',
      concatFile,
      '-c',
      'copy',
      outputPath,
    ]);
  } finally {
    try {
      fs.unlinkSync(concatFile);
    } catch (_) {}
  }

  if (!fs.existsSync(outputPath)) {
    throw new Error(`Merged suite video was not created at ${outputPath}`);
  }

  console.log(`Merged suite video created at: ${outputPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
