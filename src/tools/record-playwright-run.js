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

function parseArgs(argv) {
  const args = {};
  const commandTokens = [];
  let inCommand = false;

  for (let index = 2; index < argv.length; index++) {
    const token = argv[index];

    if (token === '--') {
      inCommand = true;
      continue;
    }

    if (inCommand) {
      commandTokens.push(token);
      continue;
    }

    if (!token.startsWith('--')) {
      continue;
    }

    const key = token.slice(2);
    const next = argv[index + 1];
    args[key] = next && !next.startsWith('--') ? argv[++index] : 'true';
  }

  return {
    args,
    command: commandTokens.join(' '),
  };
}

function getOutputPath(name) {
  const outputDir = path.resolve('test-results', 'run-videos');
  ensureDir(outputDir);
  return path.join(outputDir, `${name || 'playwright-run'}-${timestamp()}.mp4`);
}

function getRecorderArgs(outputPath) {
  if (process.platform === 'win32') {
    return [
      '-y',
      '-f',
      'gdigrab',
      '-framerate',
      process.env.SUITE_VIDEO_FPS || '15',
      '-i',
      'desktop',
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      outputPath,
    ];
  }

  if (process.platform === 'linux') {
    const display = process.env.DISPLAY || ':99';
    const normalizedDisplay = display.includes('.') ? display : `${display}.0`;
    return [
      '-y',
      '-f',
      'x11grab',
      '-video_size',
      process.env.SUITE_VIDEO_SIZE || '1920x1080',
      '-framerate',
      process.env.SUITE_VIDEO_FPS || '15',
      '-i',
      normalizedDisplay,
      '-pix_fmt',
      'yuv420p',
      '-preset',
      'ultrafast',
      outputPath,
    ];
  }

  throw new Error(`Unsupported platform for suite recording: ${process.platform}`);
}

function startRecorder(outputPath) {
  const recorder = spawn(ffmpeg.path, getRecorderArgs(outputPath), {
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

function runCommand(command) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, {
      stdio: 'inherit',
      shell: true,
      env: {
        ...process.env,
        PLAYWRIGHT_VIDEO_MODE: 'off',
      },
    });

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
  const { args, command } = parseArgs(process.argv);
  if (!command) {
    throw new Error('No command provided. Usage: node src/tools/record-playwright-run.js --output-name retail-suite -- <command>');
  }

  const outputPath = getOutputPath(args['output-name']);
  console.log(`Recording suite run to: ${outputPath}`);
  console.log(`Running command: ${command}`);

  const recorder = startRecorder(outputPath);
  await wait(1500);

  let exitCode = 1;
  try {
    exitCode = await runCommand(command);
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
