#!/usr/bin/env node
'use strict';

/**
 * Launcher for the Electron crawl-display E2E (crawlDisplay.electron.main.js).
 *
 * Works on a desktop (Windows/macOS/Linux with a display) AND headless in a
 * Linux sandbox/CI: when no DISPLAY is available it wraps electron in
 * `xvfb-run -a` automatically.
 *
 *   node src/ui/electron/unifiedApp/checks/crawlDisplay.electron.check.js \
 *     [--screenshot out.png]
 *
 * Electron binary resolution: ELECTRON_BIN env → repo node_modules/.bin →
 * `electron` on PATH.
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..', '..');
const MAIN = path.join(__dirname, 'crawlDisplay.electron.main.js');

function resolveElectron() {
  if (process.env.ELECTRON_BIN && fs.existsSync(process.env.ELECTRON_BIN)) {
    return process.env.ELECTRON_BIN;
  }
  const local = process.platform === 'win32'
    ? path.join(REPO_ROOT, 'node_modules', '.bin', 'electron.cmd')
    : path.join(REPO_ROOT, 'node_modules', '.bin', 'electron');
  if (fs.existsSync(local)) return local;
  return 'electron';
}

function run() {
  const electron = resolveElectron();
  const passthrough = process.argv.slice(2);
  const headlessLinux = process.platform === 'linux' && !process.env.DISPLAY;

  const electronArgs = [
    MAIN,
    // Sandboxing is unavailable in most containers; harmless elsewhere for
    // a check that only loads our own localhost stub.
    ...(headlessLinux ? ['--no-sandbox', '--disable-gpu'] : []),
    ...passthrough
  ];

  const cmd = headlessLinux ? 'xvfb-run' : electron;
  const args = headlessLinux ? ['-a', electron, ...electronArgs] : electronArgs;

  console.log(`[electron-check] ${headlessLinux ? 'headless (xvfb-run) ' : ''}${electron}`);
  const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' });
  child.on('exit', (code) => process.exit(code == null ? 2 : code));
  child.on('error', (err) => {
    console.error(`[electron-check] failed to launch: ${err.message}`);
    if (headlessLinux) console.error('Is xvfb installed? (apt-get install xvfb)');
    console.error('Is electron installed? (npm i electron, or set ELECTRON_BIN)');
    process.exit(2);
  });
}

run();
