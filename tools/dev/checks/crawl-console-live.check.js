#!/usr/bin/env node
'use strict';

/**
 * crawl-console-live.check.js — the Crawl Console verified in a REAL browser
 * at every orient (TECH-CRAWLCONSOLE / TECH-CSLIVE, cycle 170).
 *
 * Spawns its own console runner on :3195 against the live news.db (READ-ONLY —
 * the runner never writes), waits for ready with a budget that covers the
 * DOCUMENTED bundle-publish boot time (the cycle-169 lesson: a 30s wait vs a
 * measured 33s boot reported machine load as an application failure), then
 * runs news-crawler-ui's own checks/console.live.check.js against it.
 *
 * Expected strings are DURABLE facts, not day-fresh data: policy hosts from
 * domain_fetch_policies (reuters.com BLOCKED) and the politeness gate line —
 * things that should survive any crawl state. Async spawn, never spawnSync
 * (spawnSync would deadlock the event loop the child needs — cycle 135).
 */

const path = require('path');
const { spawn } = require('child_process');
const http = require('http');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const PORT = 3195;
const BASE = `http://127.0.0.1:${PORT}`;
const READY_BUDGET_MS = 90000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function getOk(url) {
  return new Promise((resolve) => {
    const req = http.get(url, { timeout: 2000 }, (res) => { res.resume(); resolve(res.statusCode === 200); });
    req.on('timeout', () => { req.destroy(); resolve(false); });
    req.on('error', () => resolve(false));
  });
}

async function main() {
  const runner = spawn(process.execPath, ['tools/ui/run-crawl-console.js', '--port', String(PORT)], {
    cwd: ROOT, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true
  });
  let serverErr = '';
  runner.stderr.on('data', (c) => { serverErr += c; });

  try {
    const deadline = Date.now() + READY_BUDGET_MS;
    let ready = false;
    while (Date.now() < deadline) {
      if (await getOk(`${BASE}/api/console-model`)) { ready = true; break; }
      await sleep(1000);
    }
    if (!ready) {
      console.error(`console runner never became ready on :${PORT} within ${READY_BUDGET_MS / 1000}s. stderr: ${serverErr.slice(0, 400)}`);
      return 1;
    }

    const { runCheck } = require(path.resolve(ROOT, '..', 'news-crawler-ui', 'checks', 'console.live.check.js'));
    // 'Start crawl' (button text), not the panel title 'Launch': panel titles
    // wear text-transform:uppercase and Chromium's innerText returns the
    // TRANSFORMED text — an expect on the source-cased title fails against a
    // perfectly rendered page (measured, cycle 170).
    const results = await runCheck({
      url: `${BASE}/`,
      expects: ['reuters.com', 'BLOCKED', 'Owner-gated', 'Start crawl']
    });
    let failed = 0;
    for (const r of results) {
      console.log(`  ${r.pass ? '✅' : '❌'} ${r.name}${r.note ? ' — ' + r.note : ''}`);
      if (!r.pass) failed++;
    }
    return failed ? 1 : 0;
  } finally {
    try { runner.kill(); } catch (_) {}
  }
}

main().then((code) => process.exit(code)).catch((err) => { console.error('check crashed:', err.message); process.exit(2); });
