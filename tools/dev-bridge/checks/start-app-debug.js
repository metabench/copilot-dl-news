'use strict';

/**
 * start-app-debug.check.js — launch the Electron unified app NON-detached
 * and print everything it says for ~40s, so launch failures that are silent
 * in the bridge's detached start-app action become visible.
 *
 * Usage (via bridge): { "action": "check",
 *   "args": { "script": "tools/dev/agent-bridge/checks/start-app-debug.check.js", "argv": ["3172"] } }
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = process.argv[2] || '3172';

const localElectron = path.join(REPO_ROOT, 'node_modules', '.bin', 'electron.cmd');
const bin = fs.existsSync(localElectron) ? localElectron : 'electron';
console.log(`[debug] repo: ${REPO_ROOT}`);
console.log(`[debug] electron binary: ${bin} (exists locally: ${fs.existsSync(localElectron)})`);
console.log(`[debug] node: ${process.version}`);

const args = [
  path.join('src', 'ui', 'electron', 'unifiedApp', 'main.js'),
  '--port', String(PORT),
  '--app', 'crawl-status',
  '--allow-multi-jobs'
];
console.log(`[debug] launching: ${bin} ${args.join(' ')}`);

const child = spawn(`"${bin}" ${args.join(' ')}`, {
  cwd: REPO_ROOT,
  shell: true,
  windowsHide: false
});

child.stdout.on('data', (d) => process.stdout.write(`[app-out] ${d}`));
child.stderr.on('data', (d) => process.stdout.write(`[app-err] ${d}`));
child.on('error', (err) => console.log(`[debug] spawn error: ${err.message}`));
child.on('exit', (code, signal) => console.log(`[debug] app exited code=${code} signal=${signal || 'none'}`));

setTimeout(() => {
  console.log('[debug] 40s elapsed — stopping app');
  try { child.kill(); } catch (_) {}
  setTimeout(() => process.exit(0), 1000);
}, 40_000);
