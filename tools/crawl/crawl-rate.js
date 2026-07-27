#!/usr/bin/env node
'use strict';

/**
 * crawl-rate.js — the REAL download rate onto this machine, from DB ground
 * truth (http_responses.bytes_downloaded), NOT the server bandwidth meter.
 *
 * Why DB not the meter: crawl jobs run as FORKED WORKERS, so the server-side
 * bandwidth singleton (/api/v1/crawl/bandwidth-cap) reads totalBytes:0 — it
 * never sees the worker's fetches. The DB is the only ground truth for
 * "bytes actually landed here" (2026-07-20, owner: we should SEE 1.8 MB/s).
 *
 *   node tools/crawl/crawl-rate.js               # rolling windows, one shot
 *   node tools/crawl/crawl-rate.js --loop 15     # every 15s (Ctrl+C to stop)
 *
 * Read-only DB open ({readonly, fileMustExist}); windows are indexed by
 * fetched_at so this is cheap (no full scan).
 */

const path = require('path');
const { openNewsCrawlerDb } = require(path.resolve(__dirname, '..', '..', 'src', 'db', 'openNewsCrawlerDb'));

const argv = process.argv.slice(2);
const loopI = argv.indexOf('--loop');
const LOOP = loopI >= 0 ? Number(argv[loopI + 1] || 15) : 0;
const CAP_MBPS = 1.8;

async function sample(db) {
  const out = [];
  for (const win of [1, 5, 15]) {
    // fetched_at is ISO-8601 with a 'T' separator and trailing 'Z'
    // ("2026-07-20T20:28:51.666Z"); datetime('now',...) yields a SPACE
    // separator ("2026-07-20 20:36:50"). A raw string compare is WRONG —
    // 'T' (0x54) > ' ' (0x20), so every row from today sorts >= the cutoff
    // regardless of the minute (this once reported a fake "4.83 MB/s").
    // Wrap fetched_at in datetime() so the ISO form parses to space-form
    // before comparison.
    const r = await db.query(
      `SELECT COUNT(*) c, COALESCE(SUM(bytes_downloaded),0) b
       FROM http_responses WHERE datetime(fetched_at) >= datetime('now','-${win} minutes')`
    );
    const mbps = r[0].b / (win * 60) / 1e6;
    out.push({ win, fetches: r[0].c, mb: r[0].b / 1e6, mbps });
  }
  return out;
}

function line(rows) {
  const ts = new Date().toISOString().slice(11, 19);
  const parts = rows.map((r) => `${r.win}m:${r.mbps.toFixed(2)}MB/s(${Math.round(r.mbps / CAP_MBPS * 100)}%)`);
  const cur = rows[0];
  return `[${ts}] onto-machine  ${parts.join('  ')}  | 1m ${cur.fetches} fetches / ${cur.mb.toFixed(1)}MB  (cap ${CAP_MBPS})`;
}

(async () => {
  const db = await openNewsCrawlerDb(path.resolve(__dirname, '..', '..', 'data', 'news.db'), { readonly: true, fileMustExist: true });
  try {
    if (!LOOP) { console.log(line(await sample(db))); return; }
    const deadline = Date.now() + 2 * 3600 * 1000;
    while (Date.now() < deadline) {
      console.log(line(await sample(db)));
      await new Promise((r) => setTimeout(r, LOOP * 1000));
    }
  } finally {
    await db.close();
  }
})().catch((e) => { console.error(e.message); process.exit(1); });
