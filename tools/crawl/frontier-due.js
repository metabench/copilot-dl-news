#!/usr/bin/env node
'use strict';

/**
 * frontier-due.js — compute the due-frontier batch for ONE host and print it
 * as JSON. Read-only over data/news.db.
 *
 * The process boundary exists because of a P3-review constraint recorded in
 * docs/plans/2026-07-db-driven-crawling.md: selectDueFrontier walks the full
 * ~6.4k hub-id set (with per-id hydration) before the host filter, which is
 * fine for a click-triggered request but must NOT run on the server's
 * synchronous better-sqlite3 connection once hydration is automated on a
 * timer. Same pattern as frontier-stats.js: all SQL lives in ncdb
 * (selectDueFrontier); this script is just the boundary. The ENQUEUE side
 * deliberately stays in the orchestrator on its single adapter connection —
 * this child only READS.
 *
 * Prints { host, recencyMsHub, items: [{url, url_id, host, kind,
 * lastFetchedAt}], computeMs }.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const { selectDueFrontier } = require('news-crawler-db');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const HOST = getArg('--host', null);
const LIMIT = Number(getArg('--limit', 20));
const RECENCY_MS_HUB = Number(getArg('--recency-ms', 24 * 60 * 60 * 1000));

if (!HOST) {
  process.stderr.write('usage: frontier-due.js --host <host> [--limit N] [--recency-ms M]\n');
  process.exit(2);
}

const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: true, fileMustExist: true });
try {
  const t0 = Date.now();
  const due = selectDueFrontier(db, { recencyMsHub: RECENCY_MS_HUB, limit: LIMIT, host: HOST });
  process.stdout.write(JSON.stringify({
    host: HOST,
    recencyMsHub: due.recencyMsHub,
    items: due.items,
    skippedLowValue: due.skippedLowValue || 0,
    computeMs: Date.now() - t0
  }));
} finally {
  db.close();
}
