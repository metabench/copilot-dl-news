#!/usr/bin/env node
'use strict';
/**
 * tools/crawl/bounded-dispatch.js — dispatch ONE operation crawl against the
 * local unified UI and ENFORCE a wall-clock budget: polls the job and POSTs
 * /stop when the budget expires (the engine has no wall-clock knob — found
 * 2026-07-07 crawl-ops c3). Prints a JSON report.
 *
 * Usage: node tools/crawl/bounded-dispatch.js --url https://host/section \
 *          [--port 3000] [--max-downloads 25] [--budget-ms 180000] [--sitemap true]
 */

const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }

const startUrl = argOf('--url', null);
const port = Number(argOf('--port', 3000));
const maxDownloads = Number(argOf('--max-downloads', 25));
const budgetMs = Number(argOf('--budget-ms', 180000));
const useSitemap = argOf('--sitemap', 'true') === 'true';
const maxDepth = args.includes('--depth') ? Number(argOf('--depth', 3)) : null;
const operation = argOf('--operation', 'basicArticleCrawl');
const base = `http://127.0.0.1:${port}`;

if (!startUrl) { console.log(JSON.stringify({ ok: false, error: '--url required' })); process.exit(1); }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function api(method, path, body) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined,
    // In-process crawls starve the UI server's event loop; API calls can stall
    // far past 15s under load (observed 2026-07-07 c3 — both babysitters died).
    signal: AbortSignal.timeout(60000)
  });
  return { status: res.status, json: await res.json().catch(() => null) };
}

// If the dispatch POST times out but the server created the job anyway
// (observed c3: in-process crawls starve the API), adopt the orphan by
// matching startUrl + createdAt >= our start time in the jobs list.
async function adoptOrphan(t0iso) {
  try {
    const list = await api('GET', '/api/v1/crawl/jobs');
    const items = (list.json && list.json.items) || [];
    const mine = items.filter((j) => j.startUrl === startUrl && j.createdAt >= t0iso && !['completed', 'failed', 'stopped'].includes(j.status));
    return mine.length ? mine[mine.length - 1].id : null;
  } catch { return null; }
}

(async () => {
  const t0 = Date.now();
  const t0iso = new Date(t0 - 2000).toISOString();
  let jobId = null;
  let adopted = false;
  try {
    const start = await api('POST', `/api/v1/crawl/operations/${encodeURIComponent(operation)}/start`, {
      startUrl,
      overrides: { dbPath: 'data/news.db', maxDownloads, useSitemap, ...(maxDepth != null ? { maxDepth } : {}) }
    });
    jobId = start.json && start.json.jobId;
  } catch (_e) { /* fall through to adoption */ }
  if (!jobId) {
    for (let i = 0; i < 6 && !jobId; i++) { await sleep(5000); jobId = await adoptOrphan(t0iso); }
    adopted = Boolean(jobId);
  }
  if (!jobId) { console.log(JSON.stringify({ ok: false, error: 'dispatch failed and no orphan found' })); process.exit(1); }

  let stopped = false;
  let finalStatus = 'unknown';
  for (;;) {
    await sleep(5000);
    const j = await api('GET', `/api/v1/crawl/jobs/${jobId}`);
    finalStatus = j.json && j.json.job ? j.json.job.status : 'unknown';
    if (['completed', 'failed', 'stopped'].includes(finalStatus)) break;
    if (!stopped && Date.now() - t0 > budgetMs) {
      await api('POST', `/api/v1/crawl/jobs/${jobId}/stop`);
      stopped = true; // keep polling until terminal
    }
    if (Date.now() - t0 > budgetMs + 60000) break; // stop didn't land; give up politely
  }

  console.log(JSON.stringify({
    ok: ['completed', 'stopped'].includes(finalStatus),
    jobId, startUrl, finalStatus, adopted,
    budgetMs, elapsedMs: Date.now() - t0, budgetEnforced: stopped,
    underBudget: !stopped && Date.now() - t0 <= budgetMs
  }));
})().catch((err) => { console.log(JSON.stringify({ ok: false, error: err.message })); process.exit(1); });
