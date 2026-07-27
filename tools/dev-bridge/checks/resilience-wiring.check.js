#!/usr/bin/env node
'use strict';

/**
 * resilience-wiring.check.js — the server-child resilience + crawl-stability
 * wiring is still present (RB-011 probe, 2026-07-20).
 *
 * Two hard-won fixes are easy to silently delete in a refactor because they
 * live in error paths nothing exercises on the happy path:
 *   1. Server-child SUPERVISION (main.js): the Express server is a spawned
 *      child; without a persistent exit-watcher (respawn), a liveness WATCHDOG
 *      (recover a WEDGED-but-alive child), child-stderr forwarding (crash
 *      visibility) and server.js top-level uncaughtException/unhandledRejection
 *      capture, a crawl that crashes OR wedges the child left the UI dead until
 *      a manual restart-electron.
 *   2. run-multi DISPATCH-AND-RETURN + serial-reconcile (server.js): the
 *      synchronous 8-way reconciliation used to wedge the event loop; the fix
 *      returns a batchId and reconciles hosts serially off the accept loop.
 *
 * This is a STATIC source check (no server needed): it greps the two files for
 * marker strings and FAILS if any are missing — a regression tripwire, not a
 * behavioral test. Exit 0 = all present, 1 = something was removed.
 *
 *   node tools/dev-bridge/checks/resilience-wiring.check.js
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const CHECKS = [
  {
    file: 'src/ui/electron/unifiedApp/main.js',
    markers: [
      ['launchSupervisedServer', 'server-child supervisor'],
      ['[supervisor] respawning', 'respawn-on-crash'],
      ['[watchdog]', 'liveness watchdog'],
      ['WATCHDOG_MAX_FAILS', 'watchdog failure threshold'],
      ['probeHealth', 'watchdog health probe'],
      ['process.stdout.write(chunk)', 'child stdout forwarding (crash visibility)'],
      // 2026-07-26: crawl jobs MUST fork. Without UI_CRAWL_WORKER=1 reaching the
      // server child they run in-process, so a crawl fault kills the server, wipes
      // the job registry and writes no per-job log. Measured: crash at ~25s vs
      // 360s+ stable, and ~0.5 -> ~1.45 MB/s. Deleting this default silently
      // reintroduces the whole failure class.
      ["UI_CRAWL_WORKER: process.env.UI_CRAWL_WORKER || '1'", 'worker mode defaults ON']
    ]
  },
  {
    file: 'src/ui/server/unifiedApp/server.js',
    markers: [
      ["process.on('uncaughtException'", 'server-child uncaughtException capture'],
      ["process.on('unhandledRejection'", 'server-child unhandledRejection capture'],
      ['[server] FATAL', 'FATAL crash log line'],
      ['startHostJob', 'run-multi start phase (parallel fetch)'],
      ['reconcileHostJob', 'run-multi reconcile phase (serial)'],
      ['run-multi/:batchId', 'dispatch-and-return batch status route'],
      ['inProcessCrawlJobRegistry.stop', 'abort-on-wait-cap (stops a stuck host, no lingering job)'],
      ['returnedToPending', 'aborted-host rows returned to pending (not failed)'],
      ['createStuckMonitor', 'guarded EWMA stuck-host trigger (measured, not blind 4-min cap)'],
      ['abortReason', 'batch records why a host was aborted (stuck|timedOut) — observability'],
      ['selectRecentHostFetchGapMedians', 'adaptive per-host limit (size lease to measured crawl-delay, never over-lease a slow host)'],
      ['hostLimits', 'batch records the adaptive per-host limits — observability + politeness (count only, never the delay)']
    ]
  }
];

let missing = 0;
for (const { file, markers } of CHECKS) {
  let src;
  try { src = fs.readFileSync(path.join(ROOT, file), 'utf8'); }
  catch (e) { console.log(`❌ cannot read ${file}: ${e.message}`); missing += markers.length; continue; }
  for (const [needle, label] of markers) {
    if (src.includes(needle)) continue;
    console.log(`❌ ${file}: MISSING ${label}  (marker: ${JSON.stringify(needle)})`);
    missing += 1;
  }
}

if (missing) {
  console.log(`\n❌ resilience wiring: ${missing} marker(s) gone — a refactor likely removed a crash/wedge guard.`);
  console.log('   See docs/agi/IMPROVEMENT_LEDGER.md (2026-07-20 server-child resilience + dispatch-and-return rows) before "fixing" this by deleting the marker.');
  process.exit(1);
}
console.log('✅ resilience wiring intact: supervisor + watchdog + FATAL capture + dispatch-and-return all present.');
process.exit(0);
