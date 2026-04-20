const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const ffmpeg = require('@ffmpeg-installer/ffmpeg');

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, '-');
}

function getOutputPath() {
  const outputDir = path.resolve('test-results', 'run-videos');
  ensureDir(outputDir);
  return path.join(outputDir, `retail-p0-run-${timestamp()}.mp4`);
}

function startRecorder(outputPath) {
  const args = [
    '-y',
    '-f',
    'gdigrab',
    '-framerate',
    '15',
    '-i',
    'desktop',
    '-pix_fmt',
    'yuv420p',
    '-preset',
    'ultrafast',
    outputPath,
  ];

  const recorder = spawn(ffmpeg.path, args, {
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  recorder.stderr.on('data', () => {});
  recorder.stdout.on('data', () => {});

  return recorder;
}

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runTests() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.platform === 'win32' ? 'npx.cmd' : 'npx',
      ['playwright', 'test', 'tests/e2e/retail-p0-healing.spec.js', '--headed'],
      {
        stdio: 'inherit',
        env: {
          ...process.env,
          PLAYWRIGHT_VIDEO_MODE: 'off',
        },
      }
    );

    child.on('error', reject);
    child.on('exit', (code) => resolve(code ?? 1));
  });
}

async function stopRecorder(recorder) {
  if (!recorder || recorder.killed) {
    return;
  }

  try {
    recorder.stdin.write('q');
  } catch (_) {}

  await new Promise((resolve) => {
    const timeout = setTimeout(() => {
      try {
        recorder.kill('SIGTERM');
      } catch (_) {}
      resolve();
    }, 5000);

    recorder.once('exit', () => {
      clearTimeout(timeout);
      resolve();
    });
  });
}

async function main() {
  const outputPath = getOutputPath();
  console.log(`Recording full retail P0 run to: ${outputPath}`);
  console.log('Keep the browser visible on screen during the run for the recording to capture it.');

  const recorder = startRecorder(outputPath);
  await wait(1500);

  let exitCode = 1;
  try {
    exitCode = await runTests();
  } finally {
    await stopRecorder(recorder);
  }

  console.log(`Suite video saved at: ${outputPath}`);
  process.exit(exitCode);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
