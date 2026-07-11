#!/usr/bin/env node
'use strict';
/**
 * tools/crawl/campaign-runner.js — multi-hour crawl campaign orchestrator.
 * Runs as a managed (detached) process on the operator's machine; the UI
 * (worker mode) shows every leg live. Politeness-first design:
 *   - round-robin domain rotation → long same-domain cooldowns
 *   - fresh preflight before every leg (skips bot-challenged/blocked hosts)
 *   - every leg is a bounded-dispatch child (wall-clock budget + maxDownloads)
 *   - graceful stop: stop-file checked continuously; current job stopped via API
 *   - no new legs after the campaign deadline (a final leg may overrun ≤ its budget)
 *
 * Usage:
 *   node tools/crawl/campaign-runner.js --duration-ms 14400000 \
 *     --urls "https://www.theguardian.com/world|https://www.bbc.com/news|https://apnews.com/|https://www.cbsnews.com/" \
 *     [--max-downloads 25] [--leg-budget-ms 1200000] [--leg-gap-ms 60000] [--port 3000]
 *
 * Status: writes tools/dev-bridge/state/campaign-status.json each transition.
 * Stop:   create tools/dev-bridge/state/campaign-stop (bridge stop-campaign does this).
 */

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }

const ROOT = path.resolve(__dirname, '..', '..');
const STATE_DIR = path.join(ROOT, 'tools', 'dev-bridge', 'state');
const STOP_FILE = path.join(STATE_DIR, 'campaign-stop');
const STATUS_FILE = path.join(STATE_DIR, 'campaign-status.json');
fs.mkdirSync(STATE_DIR, { recursive: true });

const durationMs = Number(argOf('--duration-ms', 4 * 3600 * 1000));
const urls = String(argOf('--urls', '')).split('|').map((s) => s.trim()).filter(Boolean);
const maxDownloads = Number(argOf('--max-downloads', 25));
const legBudgetMs = Number(argOf('--leg-budget-ms', 20 * 60 * 1000));
const legGapMs = Number(argOf('--leg-gap-ms', 60000));
const port = Number(argOf('--port', 3000));
const operation = argOf('--operation', 'basicArticleCrawl');
// Periodic UI screenshots (agent-reviewable visual record). 0 = off.
const screenshotEveryMs = Number(argOf('--screenshot-every-ms', 0));
const SHOTS_DIR = path.join(STATE_DIR, 'ui-shots');

function takeUiScreenshot() {
  try {
    fs.mkdirSync(SHOTS_DIR, { recursive: true });
    const out = path.join(SHOTS_DIR, `campaign-${Date.now()}.png`);
    const electron = path.join(ROOT, 'node_modules', '.bin', process.platform === 'win32' ? 'electron.cmd' : 'electron');
    if (!fs.existsSync(electron)) return;
    const child = spawn(`"${electron}"`, [
      path.join(ROOT, 'src', 'ui', 'electron', 'unifiedApp', 'main.js'),
      '--port', String(port), '--use-existing-server',
      '--app', 'crawl-observer', '--smoke', '--screenshot', out,
      '--screenshot-delay-ms', '2500'
    ], { cwd: ROOT, windowsHide: false, shell: true, detached: false, stdio: 'ignore' });
    setTimeout(() => { try { child.kill(); } catch (_) {} }, 60000);
    log('screenshot requested:', path.basename(out));
  } catch (_) { /* best-effort */ }
}

if (!urls.length) { console.error('[campaign] --urls required'); process.exit(1); }

const startedAt = Date.now();
const deadline = startedAt + durationMs;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(`[campaign ${new Date().toISOString()}]`, ...a);

const status = {
  startedAt: new Date(startedAt).toISOString(),
  deadline: new Date(deadline).toISOString(),
  urls, maxDownloads, legBudgetMs,
  legs: [], state: 'starting', currentLeg: null
};
function saveStatus() { try { fs.writeFileSync(STATUS_FILE, JSON.stringify(status, null, 1)); } catch (_) {} }

function stopRequested() { return fs.existsSync(STOP_FILE); }

function runChild(script, childArgs, timeoutMs) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [path.join(ROOT, script), ...childArgs], { cwd: ROOT, windowsHide: true });
    let out = '';
    child.stdout.on('data', (c) => { out += c.toString(); });
    child.stderr.on('data', (c) => { out += c.toString(); });
    const timer = setTimeout(() => { try { child.kill(); } catch (_) {} }, timeoutMs);
    child.on('exit', () => { clearTimeout(timer); resolve(out); });
    // Propagate stop quickly: poll the stop file and kill the leg child; the
    // runner then stops the underlying job via the API.
    const stopPoll = setInterval(() => {
      if (stopRequested()) { clearInterval(stopPoll); try { child.kill(); } catch (_) {} }
    }, 5000);
    child.on('exit', () => clearInterval(stopPoll));
  });
}

async function stopActiveJobs() {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/v1/crawl/jobs`, { signal: AbortSignal.timeout(30000) });
    const items = (await res.json()).items || [];
    for (const j of items.filter((x) => x.status === 'running')) {
      try {
        await fetch(`http://127.0.0.1:${port}/api/v1/crawl/jobs/${j.id}/stop`, { method: 'POST', signal: AbortSignal.timeout(30000) });
        log('stop sent to running job', j.id.slice(0, 8));
      } catch (_) {}
    }
  } catch (_) {}
}

(async () => {
  try { fs.unlinkSync(STOP_FILE); } catch (_) {} // stale stop from a prior run
  log(`campaign start: op=${operation}, ${urls.length} target(s), ${Math.round(durationMs / 60000)}min, ${maxDownloads}pp/leg, leg budget ${Math.round(legBudgetMs / 60000)}min, screenshots every ${screenshotEveryMs ? Math.round(screenshotEveryMs / 60000) + 'min' : 'OFF'}`);
  status.operation = operation;
  status.state = 'running'; saveStatus();

  let shotTimer = null;
  if (screenshotEveryMs > 0) {
    takeUiScreenshot(); // one at start
    shotTimer = setInterval(takeUiScreenshot, screenshotEveryMs);
    if (typeof shotTimer.unref === 'function') shotTimer.unref();
  }

  let leg = 0;
  while (Date.now() < deadline && !stopRequested()) {
    const url = urls[leg % urls.length];
    const legRec = { n: leg + 1, url, startedAt: new Date().toISOString(), preflight: null, report: null };
    status.currentLeg = legRec; saveStatus();

    // Fresh preflight each leg (2 requests; politeness-safe).
    const pfOut = await runChild('tools/crawl/domain-preflight.js', [url], 60000);
    let verdict = 'unreachable';
    try { verdict = JSON.parse(pfOut)[0].verdict; } catch (_) {}
    legRec.preflight = verdict;
    if (stopRequested()) break;

    if (verdict !== 'ok') {
      log(`leg ${leg + 1}: SKIP ${url} (preflight: ${verdict})`);
      legRec.report = { skipped: true, reason: `preflight:${verdict}` };
    } else {
      log(`leg ${leg + 1}: ${url} (${maxDownloads}pp, budget ${Math.round(legBudgetMs / 60000)}min)`);
      const out = await runChild('tools/crawl/bounded-dispatch.js', [
        '--url', url, '--operation', operation,
        '--max-downloads', String(maxDownloads), '--budget-ms', String(legBudgetMs), '--port', String(port)
      ], legBudgetMs + 120000);
      try { legRec.report = JSON.parse(out.trim().split('\n').pop()); } catch (_) { legRec.report = { raw: out.slice(-300) }; }
      log(`leg ${leg + 1} done:`, JSON.stringify(legRec.report).slice(0, 160));
    }

    legRec.finishedAt = new Date().toISOString();
    status.legs.push(legRec); status.currentLeg = null; saveStatus();
    leg++;

    if (Date.now() >= deadline || stopRequested()) break;
    await sleep(legGapMs);
  }

  if (shotTimer) clearInterval(shotTimer);
  if (stopRequested()) {
    log('stop requested — stopping any running job');
    await stopActiveJobs();
    try { fs.unlinkSync(STOP_FILE); } catch (_) {}
    status.state = 'stopped';
  } else {
    status.state = 'completed';
  }
  status.finishedAt = new Date().toISOString();
  saveStatus();
  log(`campaign ${status.state}: ${status.legs.length} legs over ${Math.round((Date.now() - startedAt) / 60000)}min`);
})().catch((err) => {
  log('FATAL', err.message);
  status.state = 'crashed'; status.error = err.message; saveStatus();
  process.exit(1);
});
