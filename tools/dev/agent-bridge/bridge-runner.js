#!/usr/bin/env node
'use strict';

/**
 * DEPRECATED — merged into tools/dev-bridge (v4) on 2026-07-11.
 *
 * This runner and tools/dev-bridge/dev-bridge.js were two independently
 * built file-RPC bridges. dev-bridge is the canonical one (managed-process
 * registry, supervisor, watchdogs, heartbeats, richer actions); the useful
 * parts of this runner (.cmd spawn fix, Electron HTTP-readiness probe,
 * isolated screenshot profile, diagnostic checks) were ported there.
 *
 * Protocol differences if you have old command files:
 *   agent-bridge: { "action", "args" }   → outbox/<id>.json
 *   dev-bridge:   { "action", "params" } → outbox/<name>.result.json
 * Action mapping: start-app→start-electron, stop-app→stop-electron,
 * app-status→status (+ http probe), screenshot-app→ui-screenshot,
 * check→run-node, jest→run-tests.
 *
 * This shim just launches the real bridge.
 */

const path = require('path');
const { spawn } = require('child_process');

const target = path.resolve(__dirname, '..', '..', 'dev-bridge', 'dev-bridge.js');
console.log('[agent-bridge] DEPRECATED — forwarding to tools/dev-bridge/dev-bridge.js');
console.log('[agent-bridge] use tools/dev-bridge/inbox with { action, params } from now on.');

const child = spawn(process.execPath, [target, ...process.argv.slice(2)], {
  stdio: 'inherit',
  cwd: path.dirname(target)
});
child.on('exit', (code) => process.exit(code == null ? 0 : code));
