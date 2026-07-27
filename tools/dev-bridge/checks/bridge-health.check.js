#!/usr/bin/env node
'use strict';

/**
 * bridge-health.check.js — is the dev-bridge alive? (RB-011 probe.)
 *
 * The bridge writes a fresh-named heartbeat file (state/hb-<epoch/30s>.json)
 * every ~30s while its poll loop runs. This check reads the newest one and
 * FAILS if it is stale — so `run-probes` surfaces a dead/wedged bridge at
 * orient (the 2026-07-20 outage went undetected until inbox actions silently
 * piled up). Exit 0 = fresh, 1 = stale/absent (with the exact fix command).
 *
 *   node tools/dev-bridge/checks/bridge-health.check.js [--max-age-sec 120]
 */

const fs = require('fs');
const path = require('path');

const STATE = path.join(__dirname, '..', 'state');
const argv = process.argv.slice(2);
const maxIdx = argv.indexOf('--max-age-sec');
const MAX_AGE_SEC = maxIdx >= 0 ? Number(argv[maxIdx + 1]) : 120;

function newestHeartbeatAgeSec() {
  let files;
  try { files = fs.readdirSync(STATE).filter((f) => /^hb-.*\.json$/.test(f)); } catch { return null; }
  if (!files.length) return null;
  let newest = 0;
  for (const f of files) {
    try { newest = Math.max(newest, fs.statSync(path.join(STATE, f)).mtimeMs); } catch { /* skip */ }
  }
  if (!newest) return null;
  return (Date.now() - newest) / 1000;
}

const age = newestHeartbeatAgeSec();
if (age == null) {
  console.log('❌ dev-bridge: no heartbeat file — bridge is DOWN.');
  console.log('   Fix: run tools\\dev-bridge\\start-dev-bridge.cmd, or send {"action":"daemonize"} once it is up for a console-independent bridge.');
  process.exit(1);
}
if (age > MAX_AGE_SEC) {
  console.log(`❌ dev-bridge: heartbeat is ${Math.round(age)}s stale (> ${MAX_AGE_SEC}s) — bridge wedged/dead.`);
  console.log('   Fix: relaunch start-dev-bridge.cmd (v5 self-respawns on crash; a wedge/console-close still needs a relaunch).');
  process.exit(1);
}
console.log(`✅ dev-bridge: heartbeat ${Math.round(age)}s old — alive.`);
process.exit(0);
