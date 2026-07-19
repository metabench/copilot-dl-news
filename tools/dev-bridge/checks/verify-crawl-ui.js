'use strict';
// Verify the crawl UI shows live activity DURING a crawl (owner ask,
// 2026-07-19: "I did not see activity in the UI while crawling").
//
// Starts a small real crawl, then asserts the /api/v1/crawl/jobs snapshot
// (the exact feed the crawl-status view polls every 3s) shows the job
// RUNNING and reaching non-zero progress within a deadline — i.e. the UI
// would render live activity. Optionally captures a crawl-status PNG for
// visual confirmation (--screenshot, spawns Electron like the bridge).
//
// This DIRECTLY tests the reported symptom: it measures time-to-first-
// activity, so the known worker->registry progress lag (progress stays 0
// for ~15s on a fresh running job) shows up as a slow/failed check rather
// than a silent "looks idle" UI.
//
// Usage (app running, port 3170):
//   node tools/dev-bridge/checks/verify-crawl-ui.js
//   node tools/dev-bridge/checks/verify-crawl-ui.js --port 3170 --screenshot --deadline 30000
const path = require('path');
const { spawn } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const arg = (name, dflt) => {
  const i = process.argv.indexOf(name);
  if (i >= 0 && process.argv[i + 1] && !process.argv[i + 1].startsWith('--')) return process.argv[i + 1];
  return dflt;
};
const PORT = Number(arg('--port', '3170'));
const DEADLINE = Number(arg('--deadline', '30000'));
const SHOT = process.argv.includes('--screenshot');
const START_URL = arg('--url', 'https://www.bbc.com/news');
const BASE = `http://127.0.0.1:${PORT}`;

async function getJson(url, options) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15000), ...options });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
}

function findJob(snapshot, jobId) {
  const items = snapshot?.items || snapshot?.jobs || [];
  return items.find((j) => j.id === jobId) || null;
}

async function captureScreenshot() {
  const outPath = path.join(ROOT, 'tools', 'dev-bridge', 'state', 'ui-shots', `verify-crawl-${Date.now()}.png`);
  require('fs').mkdirSync(path.dirname(outPath), { recursive: true });
  const ELECTRON = path.join(ROOT, 'node_modules', '.bin', 'electron.cmd');
  await new Promise((resolve) => {
    const child = spawn(`"${ELECTRON}"`, [
      path.join(ROOT, 'src', 'ui', 'electron', 'unifiedApp', 'main.js'),
      '--port', String(PORT), '--use-existing-server', '--app', 'crawl-status',
      '--smoke', '--screenshot', outPath, '--screenshot-delay-ms', '2000',
      '--user-data-dir', path.join(ROOT, 'tools', 'dev-bridge', 'state', 'ui-shot-profile'),
    ], { cwd: ROOT, windowsHide: false, shell: true });
    const t = setTimeout(() => { try { child.kill(); } catch {} resolve(); }, 60000);
    child.on('exit', () => { clearTimeout(t); resolve(); });
    child.on('error', () => { clearTimeout(t); resolve(); });
  });
  return require('fs').existsSync(outPath) ? outPath : null;
}

(async () => {
  // 1. Health.
  const health = await getJson(`${BASE}/`).catch((e) => ({ status: 0, body: e.message }));
  if (health.status !== 200) { console.error(`FAIL: app not reachable at ${BASE} (status ${health.status})`); process.exit(1); }

  // 2. Start a small crawl.
  const start = await getJson(`${BASE}/api/v1/crawl/operations/basicArticleCrawl/start`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ startUrl: START_URL, overrides: { maxPages: 12, maxDownloads: 12, maxDepth: 2 } }),
  });
  const jobId = start.body?.jobId || start.body?.job?.id;
  if (!jobId) { console.error('FAIL: crawl did not start:', JSON.stringify(start.body).slice(0, 200)); process.exit(1); }
  console.log(`started crawl ${jobId.slice(0, 8)} at ${START_URL}`);

  // 3. Poll the SAME snapshot the UI reads; time to first activity.
  const t0 = Date.now();
  let appeared = false, firstActivityMs = null, lastProgress = null, lastStatus = null;
  while (Date.now() - t0 < DEADLINE) {
    await new Promise((r) => setTimeout(r, 1500));
    const snap = await getJson(`${BASE}/api/v1/crawl/jobs`);
    const job = findJob(snap.body, jobId);
    if (!job) continue;
    appeared = true;
    lastStatus = job.status;
    const p = job.progress || {};
    // "Activity" = anything the crawl-status table would render as non-idle.
    // Queue depth counts: during the robots+sitemap enqueue phase the crawler
    // discovers thousands of URLs before the first download, so queued>0 is
    // real, visible activity even while visited/downloaded are still 0.
    lastProgress = { visited: p.visited || 0, downloaded: p.downloaded || 0, queued: p.queued || 0 };
    if (firstActivityMs === null && (lastProgress.visited > 0 || lastProgress.downloaded > 0 || lastProgress.queued > 0)) {
      firstActivityMs = Date.now() - t0;
    }
    if (firstActivityMs !== null || job.status === 'completed') break;
  }

  // 4. Optional visual.
  let shotPath = null;
  if (SHOT) { shotPath = await captureScreenshot(); }

  // 5. Verdict.
  console.log(`job appeared in UI feed: ${appeared} | status: ${lastStatus} | progress: ${JSON.stringify(lastProgress)}`);
  console.log(`time-to-first-activity: ${firstActivityMs === null ? 'NONE within ' + DEADLINE + 'ms' : firstActivityMs + 'ms'}`);
  if (shotPath) console.log(`screenshot: ${path.relative(ROOT, shotPath)}`);
  if (!appeared) { console.error('FAIL: the crawl job never appeared in /api/v1/crawl/jobs (the UI would show nothing)'); process.exit(1); }
  if (firstActivityMs === null) {
    console.error('FAIL: job appeared but progress stayed 0 within the deadline — the UI shows an idle-looking running job (the reported symptom).');
    process.exit(1);
  }
  console.log('PASS: crawl activity is visible in the UI feed.');
})().catch((e) => { console.error('FATAL', e.message); process.exit(1); });
