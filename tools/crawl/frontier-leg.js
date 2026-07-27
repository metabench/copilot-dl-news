#!/usr/bin/env node
'use strict';

/**
 * frontier-leg.js — a campaign leg that DRAINS THE DB FRONTIER for one host
 * (never-downloaded URLs the P1-P6 machinery already computed), instead of
 * re-discovering from a hub.
 *
 * Why (2026-07-20): a basicArticleCrawl leg from a section hub fetched only
 * ~18 pages/15min (0.4% of the 1.8 MB/s cap) — throughput was SUPPLY-bound.
 * But the frontier holds 100k+ never-downloaded URLs per big host, so
 * hydrate + frontier/run fetches a full batch with NO discovery bottleneck.
 *
 *   node tools/crawl/frontier-leg.js --host www.theguardian.com --limit 60 [--port 3170]
 *
 * Output: one JSON line, SAME shape as bounded-dispatch (downloaded/saved/
 * found/errors/bytesDownloaded/finalStatus) so campaign-totals rolls it up
 * unchanged.
 */

const http = require('http');

const argv = process.argv.slice(2);
const getArg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const HOST = getArg('--host', null);
const LIMIT = Math.max(1, Math.min(100, Number(getArg('--limit', 50))));
const PORT = Number(getArg('--port', 3170));

if (!HOST) { console.log(JSON.stringify({ ok: false, error: '--host required' })); process.exit(1); }

function req(method, path, body) {
  return new Promise((resolve) => {
    const payload = body ? JSON.stringify(body) : null;
    const r = http.request({
      host: '127.0.0.1', port: PORT, path, method,
      headers: payload ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) } : {},
      // frontier/run is SYNCHRONOUS — it blocks until the whole seeded job
      // finishes + reconciles. A 60-URL leg at the 1.8 MB/s cap + per-host
      // politeness legitimately takes >10min (measured 2026-07-20: 118
      // Guardian pages, archive +100), so the client timeout must exceed the
      // leg budget or it false-reports "failed" while the job succeeds.
      timeout: 25 * 60 * 1000

    }, (res) => {
      let s = ''; res.on('data', (c) => { s += c; });
      res.on('end', () => { try { resolve(JSON.parse(s)); } catch { resolve(null); } });
    });
    r.on('timeout', () => { r.destroy(); resolve(null); });
    r.on('error', () => resolve(null));
    if (payload) r.write(payload);
    r.end();
  });
}

(async () => {
  // 1. Hydrate the host's frontier into crawl_queue (never-downloaded first).
  const hy = await req('POST', '/api/v1/crawl/frontier/hydrate', { host: HOST, limit: LIMIT });
  // 2. Drain it — one bounded per-host job fetching the seeded URLs (maxDepth:0).
  const run = await req('POST', '/api/v1/crawl/frontier/run', { host: HOST, limit: LIMIT });

  if (!run) { console.log(JSON.stringify({ ok: false, host: HOST, error: 'frontier/run failed', hydrate: hy })); return; }
  // frontier/run returns { completed, completedViaRedirect, failed, fetched, dequeued, ... }
  const completed = Number(run.completed || 0) + Number(run.completedViaRedirect || 0);
  console.log(JSON.stringify({
    ok: (run.failed || 0) === 0 || completed > 0,
    host: HOST, mode: 'frontier',
    finalStatus: run.jobStatus || (completed > 0 ? 'completed' : 'failed'),
    downloaded: Number(run.fetched || 0),
    saved: completed,               // frontier reconciliation confirms via http_responses
    found: Number((hy && hy.inserted) || 0),
    errors: Number(run.failed || 0),
    bytesDownloaded: 0,             // per-URL bytes not summed by run; throughput windows track MB
    dequeued: Number(run.dequeued || 0), hydrated: (hy && hy.inserted) || 0
  }));
})();
