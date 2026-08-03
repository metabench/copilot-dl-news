#!/usr/bin/env node
'use strict';

/**
 * run-crawl-console.js — copilot-dl-news RUNS the Crawl Console from the
 * news-crawler-ui sibling (TECH-CRAWLCONSOLE, cycle 169; first real consumer
 * of the repo founded in cycle 168).
 *
 * The split of responsibilities is the owner's 2026-08-03 architecture ruling:
 *   - news-crawler-ui owns the PAGE (controls + pure view-model);
 *   - THIS file — the composition root — owns every read: news.db opened
 *     READ-ONLY (live-DB writes stay owner-gated and single-writer), the
 *     article/section verdict via ArticleSignalsService, host policies from
 *     domain_fetch_policies. The UI module has no database code at all.
 *
 *   node tools/ui/run-crawl-console.js                     # live news.db, read-only, :3186
 *   node tools/ui/run-crawl-console.js --db <path>         # e.g. a scratch crawl DB
 *   node tools/ui/run-crawl-console.js --port 3187
 *
 * Query discipline: newest-N by PK (id DESC) then filter in JS — the frontier
 * tools' trick — so nothing scans 1.85M rows with datetime() per row. Bounded
 * COUNTs via `SELECT COUNT(*) FROM (SELECT 1 FROM t LIMIT cap)` so a huge
 * table can never pin the process.
 */

const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..');
const argv = process.argv.slice(2);
const getArg = (name, dflt) => {
  const i = argv.indexOf(name);
  return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : dflt;
};
const DB_PATH = path.resolve(ROOT, getArg('--db', 'data/news.db'));
const PORT = Number(getArg('--port', 3186));
const SLICE = Math.max(500, Math.min(20000, Number(getArg('--slice', 4000))));

// Consumed as a sibling module (declared in package.json as file:../news-crawler-ui;
// resolved by path so the runner also works before an npm install has linked it).
const { startConsoleServer } = require(path.resolve(ROOT, '..', 'news-crawler-ui', 'console', 'server.js'));
const ArticleSignalsService = require(path.join(ROOT, 'src', 'core', 'crawler', 'ArticleSignalsService.js'));
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

if (!fs.existsSync(DB_PATH)) {
  console.error(`no database at ${DB_PATH}`);
  process.exit(3);
}
const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });

const boundedCount = (table, cap = 100000) => {
  try {
    const { n } = db.prepare(`SELECT COUNT(*) AS n FROM (SELECT 1 FROM ${table} LIMIT ${cap + 1})`).get();
    return { n: Math.min(n, cap), capped: n > cap };
  } catch (_) { return null; }
};

// Schema-tolerant prepares: this runner meets DBs of different vintages (the
// live news.db has accreted columns like urls.title; a fresh crawler-created
// scratch DB has not). A missing column degrades that panel to its honest
// empty state — it never kills the console.
const safePrep = (sql) => { try { return db.prepare(sql); } catch (_) { return null; } };
const stmts = {
  fetchEvents: safePrep(`
    SELECT hr.fetched_at, hr.http_status, u.host
    FROM http_responses hr JOIN urls u ON u.id = hr.url_id
    ORDER BY hr.id DESC LIMIT ?`)
    || safePrep(`SELECT fetched_at, http_status, host FROM fetches ORDER BY id DESC LIMIT ?`)
    || safePrep(`SELECT fetched_at, http_status, NULL AS host FROM http_responses ORDER BY id DESC LIMIT ?`),
  headlineRows: safePrep(`
    SELECT url, host, title, fetched_at, word_count
    FROM urls
    WHERE title IS NOT NULL AND title <> '' AND url LIKE 'http%'
    ORDER BY id DESC LIMIT 300`)
};

// Stored titles carry raw HTML entities (&#x27; &amp; …). Decoding is DATA
// hygiene, so it lives here at the composition root — the UI module renders
// what it is given through structural escaping and never post-processes.
// (Same decoder report-fresh-headlines proved on this corpus.)
function decodeEntities(s) {
  return String(s)
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/\s+/g, ' ').trim();
}

function readPolicies() {
  try {
    return db.prepare('SELECT host, protection_kind, fetch_strategy FROM domain_fetch_policies LIMIT 50').all();
  } catch (_) { return []; }  // scratch DBs may not carry the table
}

function getRaw() {
  const fetchEvents = stmts.fetchEvents ? stmts.fetchEvents.all(SLICE) : [];
  const headlineRows = (stmts.headlineRows ? stmts.headlineRows.all() : []).map((r) => ({
    ...r,
    title: decodeEntities(r.title),
    articleShaped: ArticleSignalsService.isArticleShapedUrl(r.url)
  }));
  return {
    now: new Date().toISOString(),
    dbLabel: `${path.relative(ROOT, DB_PATH) || DB_PATH} (read-only)`,
    sliceLimit: SLICE,
    fetchEvents,
    headlineRows,
    policies: readPolicies(),
    storedCount: boundedCount('content_storage'),
    queueCount: boundedCount('crawl_queue'),
    claimsRunning: null  // wired to the jobs API when :3170 is up — never faked
  };
}

startConsoleServer({ port: PORT, getRaw, label: 'crawl-console' })
  .then(() => console.log(`[crawl-console] serving ${path.basename(DB_PATH)} read-only`))
  .catch((err) => { console.error('[crawl-console] failed to start:', err.message); process.exit(1); });
