'use strict';

/**
 * restart-bridge.check.js — self-replacement for the agent-bridge runner.
 *
 * Runs AS a `check` action inside the currently running (old) runner:
 *   1. spawns a fresh detached runner with the current bridge-runner.js code
 *      (output → outbox/runner-restart.log),
 *   2. kills the parent (old runner) so the two never race over the inbox
 *      for more than a moment.
 *
 * The old runner dies before it can write this command's result file — a
 * follow-up `ping` answered from the new instance is the success signal.
 */

const path = require('path');
const fs = require('fs');
const { spawn, execSync } = require('child_process');

const BRIDGE_DIR = path.resolve(__dirname, '..');
const RUNNER = path.join(BRIDGE_DIR, 'bridge-runner.js');
const OUTBOX = path.join(BRIDGE_DIR, 'outbox');
fs.mkdirSync(OUTBOX, { recursive: true });

const logFd = fs.openSync(path.join(OUTBOX, 'runner-restart.log'), 'a');
const args = process.argv.slice(2); // pass through e.g. --allow-exec

console.log(`[restart] spawning new runner: node ${RUNNER} ${args.join(' ')}`);
const child = spawn(process.execPath, [RUNNER, ...args], {
  cwd: BRIDGE_DIR,
  detached: true,
  stdio: ['ignore', logFd, logFd],
  windowsHide: true
});
child.unref();
console.log(`[restart] new runner pid=${child.pid}`);

const parentPid = process.ppid;
console.log(`[restart] stopping old runner pid=${parentPid}`);
setTimeout(() => {
  try {
    if (process.platform === 'win32') {
      execSync(`taskkill /PID ${parentPid} /F`, { stdio: 'ignore' });
    } else {
      process.kill(parentPid, 'SIGTERM');
    }
  } catch (err) {
    console.log(`[restart] kill failed: ${err.message}`);
  }
  process.exit(0);
}, 500);
