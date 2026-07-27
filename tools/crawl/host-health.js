#!/usr/bin/env node
'use strict';

/**
 * host-health.js — per-host crawl-health report from DB ground truth, so the
 * "is this host slow because it's BROKEN or because it's being POLITE?"
 * question is answerable at a glance (task #44, 2026-07-21).
 *
 * Why this exists: a large/slow host (Guardian: ~33s between fetches) was
 * mis-diagnosed for months as a whole-process "dead-time" bug. A multi-agent
 * diagnosis pinned it as a PER-HOST robots.txt crawl-delay throttle — regular,
 * working-as-designed politeness, NOT a stall. The tell is the GAP REGULARITY:
 * a low coefficient-of-variation (CV) inter-fetch gap = a fixed crawl-delay
 * floor (throttle); an irregular/spiky gap with a live process = a real stall.
 * This surfaces that distinction per host from the persisted http_responses
 * timing, read-only — the observability the misdiagnosis lacked.
 *
 *   node tools/crawl/host-health.js [--since-min 30] [--min-fetches 3]
 *
 * Read-only DB open ({readonly, fileMustExist}); the query is bounded by the
 * fetched_at time window (indexed), never a full scan of the 30GB DB.
 */

const path = require('path');
const { openNewsCrawlerDb } = require(path.resolve(__dirname, '..', '..', 'src', 'db', 'openNewsCrawlerDb'));
const { classifyHost } = require('./lib/hostHealthClassify');

const argv = process.argv.slice(2);
const arg = (n, d) => { const i = argv.indexOf(n); return i >= 0 && argv[i + 1] ? argv[i + 1] : d; };
const SINCE_MIN = Math.max(1, Number(arg('--since-min', 30)));
const MIN_FETCHES = Math.max(1, Number(arg('--min-fetches', 3)));

function hostOf(url) {
  try { return new URL(url).hostname; } catch (_) {
    return String(url || '').replace(/^https?:\/\//, '').split('/')[0] || '?';
  }
}
const median = (a) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.floor(s.length / 2)]; };

(async () => {
  const db = await openNewsCrawlerDb(path.resolve(__dirname, '..', '..', 'data', 'news.db'), { readonly: true, fileMustExist: true });
  try {
    // Bounded by the indexed fetched_at window; LIMIT is a hard safety cap.
    const rows = await db.query(
      `SELECT u.url url, datetime(h.fetched_at) t, h.bytes_downloaded bytes, h.total_ms total_ms, h.ttfb_ms ttfb
       FROM http_responses h JOIN urls u ON u.id = h.url_id
       WHERE datetime(h.fetched_at) >= datetime('now','-${SINCE_MIN} minutes')
       ORDER BY h.fetched_at
       LIMIT 5000`
    );
    const byHost = new Map();
    for (const r of rows) {
      const host = hostOf(r.url);
      if (!byHost.has(host)) byHost.set(host, []);
      byHost.get(host).push(r);
    }

    const report = [];
    for (const [host, hr] of byHost) {
      if (hr.length < MIN_FETCHES) continue;
      hr.sort((a, b) => (a.t < b.t ? -1 : 1));
      // Inter-fetch gaps IN CRAWL ORDER (order matters — the classifier's backoff-run
      // detector distinguishes a run of consecutive large gaps from an isolated idle).
      const gaps = [];
      for (let i = 1; i < hr.length; i++) {
        const g = (new Date(hr[i].t.replace(' ', 'T') + 'Z') - new Date(hr[i - 1].t.replace(' ', 'T') + 'Z')) / 1000;
        if (g >= 0) gaps.push(g);
      }
      const totalBytes = hr.reduce((a, r) => a + (Number(r.bytes) || 0), 0);
      const spanSec = Math.max(1, (new Date(hr[hr.length - 1].t.replace(' ', 'T') + 'Z') - new Date(hr[0].t.replace(' ', 'T') + 'Z')) / 1000);
      // Calibrated classification (cycle 59): session-idle exclusion (120s) + backoff-run
      // detector + robust MAD dispersion, adversarially validated in lib/hostHealthClassify.
      const c = classifyHost(gaps);
      const kbMed = median(hr.map((r) => (Number(r.bytes) || 0) / 1000));
      const ttfbMed = median(hr.map((r) => Number(r.ttfb) || 0));
      report.push({ host, n: hr.length, mbps: totalBytes / spanSec / 1e6, gMed: c.gMed, cv: c.robustCv, activeCount: c.activeCount, droppedIdle: c.droppedIdle, backoffRun: c.backoffRun, kbMed, ttfbMed, cls: c.cls, verdict: c.verdict });
    }
    report.sort((a, b) => b.gMed - a.gMed);

    // --json: machine output for the crawl-status per-host health badge (the
    // server spawns this in a CHILD PROCESS so the ~2s GROUP BY stays off its
    // event loop — see the endpoint in unifiedApp/server.js).
    if (argv.includes('--json')) {
      process.stdout.write(JSON.stringify({ sinceMin: SINCE_MIN, minFetches: MIN_FETCHES, hosts: report }) + '\n');
      return;
    }

    console.log(`per-host crawl health (last ${SINCE_MIN} min, >=${MIN_FETCHES} fetches):`);
    if (!report.length) { console.log('  (no host met the threshold in the window)'); return; }
    for (const r of report) {
      console.log(`  ${r.host.padEnd(22)} ${String(r.n).padStart(3)}f  ${r.mbps.toFixed(3)}MB/s  gap~${r.gMed.toFixed(0)}s(rCV ${r.cv.toFixed(2)}, ${r.activeCount}act/${r.droppedIdle}idle)  ${Math.round(r.kbMed)}KB/pg  ttfb~${Math.round(r.ttfbMed)}ms`);
      console.log(`      → ${r.verdict}`);
    }
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
