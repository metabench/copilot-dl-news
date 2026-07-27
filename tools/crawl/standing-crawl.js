#!/usr/bin/env node
'use strict';

/**
 * standing-crawl.js — the per-turn crawl+report obligation as ONE command.
 *
 *   node tools/crawl/standing-crawl.js [--port 3170] [--max-hosts 3]
 *        [--per-host 4] [--no-tick] [--minutes 20]
 *
 * Sequence (all against the running unified app, localhost only):
 *   1. POST /api/v1/crawl/auto-hydrate/tick   — top up crawl_queue (policy-
 *      filtered, rotated, dead-hub-suppressed). Skipped with --no-tick.
 *   2. POST /api/v1/crawl/frontier/run-multi  — bounded concurrent per-host
 *      jobs draining the queue (blocks until reconciliation completes).
 *   3. report-fresh-headlines --hub-links     — what actually came in.
 *
 * Exists because every loop turn was paying 3 commands + JSON-parsing by
 * hand for exactly this sequence (2026-07-20; see IMPROVEMENT_LEDGER).
 * Bounded by construction: run-multi caps maxHosts<=4, perHostLimit<=20.
 */

const http = require('http');
const path = require('path');
const { spawnSync } = require('child_process');

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const PORT = Number(getArg('--port', 3170));
const MAX_HOSTS = Number(getArg('--max-hosts', 3));
const PER_HOST = Number(getArg('--per-host', 4));
const MINUTES = Number(getArg('--minutes', 20));
const DO_TICK = !argv.includes('--no-tick');

function post(pathname, body, timeoutMs) {
  return new Promise((resolve) => {
    const payload = JSON.stringify(body || {});
    const req = http.request({
      host: '127.0.0.1', port: PORT, path: pathname, method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
      timeout: timeoutMs
    }, (res) => {
      let out = '';
      res.on('data', (c) => { out += c; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, json: JSON.parse(out) }); }
        catch (_) { resolve({ status: res.statusCode, json: null }); }
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ status: 0, error: 'timeout' }); });
    req.on('error', (err) => resolve({ status: 0, error: err.message }));
    req.end(payload);
  });
}

(async () => {
  if (DO_TICK) {
    console.log('== 1/3 hydrate tick ==');
    const tick = await post('/api/v1/crawl/auto-hydrate/tick', {}, 120000);
    if (tick.status !== 200) { console.log('  tick failed:', tick.status, tick.error || ''); }
    else if (tick.json.skipped) { console.log('  skipped:', tick.json.skipped); }
    else {
      if (tick.json.filteredOut && tick.json.filteredOut.length) console.log('  policy filteredOut:', tick.json.filteredOut.join(', '));
      for (const h of tick.json.hosts || []) console.log(`  ${h.host}: due=${h.due} inserted=${h.inserted}${h.error ? ' ERROR ' + h.error : ''}`);
    }
  } else {
    console.log('== 1/3 hydrate tick == (skipped: --no-tick)');
  }

  console.log('== 2/3 run-multi ==');
  const run = await post('/api/v1/crawl/frontier/run-multi', { maxHosts: MAX_HOSTS, perHostLimit: PER_HOST }, 420000);
  if (run.status !== 200 || !run.json) {
    console.log('  run-multi failed:', run.status, run.error || '');
  } else if (run.json.message) {
    console.log(' ', run.json.message);
  } else {
    for (const h of run.json.results || []) {
      console.log(`  ${h.host}: fetched=${h.fetched ?? 0} completed=${h.completed ?? 0} viaRedirect=${h.completedViaRedirect ?? 0} failed=${h.failed ?? 0}${h.error ? ' ERROR ' + h.error : ''}`);
    }
    const t = run.json.totals || {};
    console.log(`  TOTAL fetched=${t.fetched} completed=${t.completed} (viaRedirect=${t.completedViaRedirect}) failed=${t.failed}`);
  }

  console.log('== 3/3 fresh headlines ==');
  const report = spawnSync(process.execPath, [
    path.join(__dirname, '..', 'dev-bridge', 'checks', 'report-fresh-headlines.js'),
    '--minutes', String(MINUTES), '--hub-links'
  ], { encoding: 'utf8', windowsHide: true });
  process.stdout.write(report.stdout || '');
  if (report.status !== 0) process.stdout.write(report.stderr || '');
})();
