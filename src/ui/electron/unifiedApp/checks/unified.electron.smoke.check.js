'use strict';

const fs = require('fs');
const http = require('http');
const path = require('path');
const { spawn } = require('child_process');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function findWinUnpackedExe(distDir) {
  if (!fs.existsSync(distDir)) return null;

  const entries = fs
    .readdirSync(distDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && e.name.endsWith('-unpacked'))
    .map((e) => e.name);

  for (const folder of entries) {
    const full = path.join(distDir, folder);
    const exe = fs
      .readdirSync(full, { withFileTypes: true })
      .filter((e) => e.isFile() && e.name.toLowerCase().endsWith('.exe'))
      .map((e) => path.join(full, e.name))
      .sort((a, b) => b.length - a.length)[0];

    if (exe) return exe;
  }

  return null;
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = http.createServer();
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      server.close((err) => {
        if (err) return reject(err);
        resolve(address.port);
      });
    });
    server.on('error', reject);
  });
}

async function run() {
  const repoRoot = path.resolve(__dirname, '..', '..', '..', '..', '..');
  const distDir = path.join(repoRoot, 'dist');

  const exePath = findWinUnpackedExe(distDir);
  if (!exePath) {
    throw new Error(
      [
        'Could not find a packaged Electron EXE under dist/*-unpacked/*.exe',
        'Build it first:',
        '  npm run electron:unified:dist',
        '',
        `Searched: ${distDir}`
      ].join('\n')
    );
  }

  const port = await getFreePort();
  const smokeTimeoutMs = 12_000;

  const child = spawn(exePath, ['--smoke', '--port', String(port), '--smoke-timeout-ms', String(smokeTimeoutMs)], {
    cwd: path.dirname(exePath),
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true
  });

  const output = { stdout: '', stderr: '' };
  child.stdout?.on('data', (d) => (output.stdout += d.toString()));
  child.stderr?.on('data', (d) => (output.stderr += d.toString()));

  let exited = false;
  let exitCode = null;
  child.once('exit', (code) => {
    exited = true;
    exitCode = code;
  });

  const deadline = Date.now() + smokeTimeoutMs + 5000;
  while (!exited && Date.now() < deadline) {
    await delay(100);
  }

  if (!exited) {
    try {
      child.kill();
    } catch (_) {}
    await delay(250);
    try {
      child.kill('SIGKILL');
    } catch (_) {}

    throw new Error(
      [
        'Electron smoke process did not exit within expected timeout.',
        `exe: ${exePath}`,
        `port: ${port}`,
        output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1000)}` : '',
        output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1000)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  if (exitCode !== 0) {
    throw new Error(
      [
        `Electron smoke exit code was ${exitCode} (expected 0).`,
        `exe: ${exePath}`,
        output.stdout ? `--- stdout ---\n${output.stdout.slice(0, 1000)}` : '',
        output.stderr ? `--- stderr ---\n${output.stderr.slice(0, 1000)}` : ''
      ]
        .filter(Boolean)
        .join('\n')
    );
  }

  console.log('✅ Electron unified app smoke passed');
  console.log(`   exe: ${exePath}`);
}

run().catch((err) => {
  console.error('❌ Electron unified app smoke failed');
  console.error(err && err.stack ? err.stack : String(err));
  process.exitCode = 1;
});
