#!/usr/bin/env node
'use strict';
/**
 * tools/crawl/verify-crawl-delta.js — READ-ONLY crawl evidence from a crawl DB.
 *
 * Prints JSON: total counts, and (with --since <ISO>) per-host status taxonomy,
 * bytes, politeness signals (429/5xx), and newest rows in the window.
 *
 * Usage: node tools/crawl/verify-crawl-delta.js [--db data/news.db] [--since 2026-07-07T19:00:00Z]
 * Never writes. Safe against a live WAL writer (same-machine readonly open).
 */

const path = require('path');

const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }

const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const sinceIso = argOf('--since', null);

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });

function count(sql, params = []) { try { return db.prepare(sql).get(...params).n; } catch (_e) { return null; } }

const out = {
  db: dbPath,
  at: new Date().toISOString(),
  sinceIso,
  totals: {
    http_responses: count('SELECT COUNT(*) AS n FROM http_responses'),
    content_storage: count('SELECT COUNT(*) AS n FROM content_storage'),
    urls: count('SELECT COUNT(*) AS n FROM urls'),
    fetches: count('SELECT COUNT(*) AS n FROM fetches')
  }
};

if (sinceIso) {
  const w = { responses: count('SELECT COUNT(*) AS n FROM http_responses WHERE fetched_at >= ?', [sinceIso]) };
  try {
    w.byHostStatus = db.prepare(`
      SELECT u.host AS host, h.http_status AS status, COUNT(*) AS n, SUM(h.bytes_downloaded) AS bytes
      FROM http_responses h JOIN urls u ON u.id = h.url_id
      WHERE h.fetched_at >= ? GROUP BY u.host, h.http_status ORDER BY u.host, h.http_status`).all(sinceIso);
  } catch (_e) { w.byHostStatus = null; }
  w.politeness = {
    rateLimited429: count('SELECT COUNT(*) AS n FROM http_responses WHERE fetched_at >= ? AND http_status = 429', [sinceIso]),
    serverErrors5xx: count('SELECT COUNT(*) AS n FROM http_responses WHERE fetched_at >= ? AND http_status >= 500', [sinceIso])
  };
  try {
    w.newest = db.prepare(`
      SELECT u.url AS url, h.http_status AS status, h.bytes_downloaded AS bytes, h.fetched_at AS at
      FROM http_responses h JOIN urls u ON u.id = h.url_id
      WHERE h.fetched_at >= ? ORDER BY h.fetched_at DESC LIMIT 8`).all(sinceIso);
  } catch (_e) { w.newest = null; }
  // datetime() normalizes both '2026-07-07 19:49:00' and '2026-07-07T19:49:00Z'
  // forms; raw string comparison silently misses space-format rows.
  try {
    w.contentAdded = count('SELECT COUNT(*) AS n FROM content_storage WHERE datetime(created_at) >= datetime(?)', [sinceIso]);
  } catch (_e) { w.contentAdded = null; }
  out.window = w;
}

db.close();
process.stdout.write(JSON.stringify(out, null, 2) + '\n');
