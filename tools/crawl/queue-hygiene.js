#!/usr/bin/env node
'use strict';

/**
 * queue-hygiene.js — purge low-value crawl_queue rows that predate the
 * frontier's low-value gate (2026-07-20). The gate stops NEW junk from being
 * selected, but rows hydrated BEFORE it exist in every status:
 *   - pending junk still gets dequeued by run-multi and fails (the 2/6-yield
 *     rounds observed live);
 *   - failed/completed junk just waits for the 7-day prune.
 * This tool removes rows matching the SAME two junk classes the gate uses
 * (?page=N pagination, /archive(s)/ with a >2-year-old year) — dry-run by
 * default; --apply to delete. In-progress rows are NEVER touched (a running
 * job owns them).
 *
 *   node tools/crawl/queue-hygiene.js            (dry-run: list what would go)
 *   node tools/crawl/queue-hygiene.js --apply
 *
 * Safety: junk rows can never be re-selected (the gate excludes them from
 * selectDueFrontier), so deleting them cannot cause refetch loops; articles
 * remain fetch-once via http_responses eligibility, not queue history.
 */

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const Database = require(require.resolve('better-sqlite3', { paths: [ROOT, path.join(ROOT, '..', 'news-crawler-db')] }));

const APPLY = process.argv.includes('--apply');

// Mirrors ncdb _isLowValueFrontierUrl (legacy-crawlFrontier.ts). Kept as SQL
// LIKE pre-filter + exact JS check so the tool matches the gate precisely.
function isLowValue(url) {
  if (/[?&]page=\d+/i.test(url)) return true;
  const m = /\/archives?\/(?:[^?#]*?)(19\d{2}|20\d{2})(?:\/|$)/i.exec(url);
  if (m && Number(m[1]) < new Date().getFullYear() - 2) return true;
  return false;
}

const db = new Database(path.join(ROOT, 'data', 'news.db'), APPLY ? {} : { readonly: true, fileMustExist: true });
try {
  const rows = db.prepare(`
    SELECT id, url, status FROM crawl_queue
    WHERE status != 'in-progress'
      AND (url LIKE '%page=%' OR url LIKE '%/archive%')
  `).all();
  const junk = rows.filter((r) => isLowValue(r.url));
  console.log(`crawl_queue rows matching the low-value classes (excl. in-progress): ${junk.length}`);
  const byStatus = {};
  for (const r of junk) byStatus[r.status] = (byStatus[r.status] || 0) + 1;
  console.log('by status:', JSON.stringify(byStatus));
  for (const r of junk.slice(0, 12)) console.log(`  [${r.status}] ${r.url.slice(0, 100)}`);
  if (junk.length > 12) console.log(`  … and ${junk.length - 12} more`);

  if (!APPLY) {
    console.log('\nDRY RUN — nothing deleted. Re-run with --apply to purge.');
  } else if (junk.length) {
    const del = db.prepare('DELETE FROM crawl_queue WHERE id = ?');
    const tx = db.transaction((items) => { for (const r of items) del.run(r.id); });
    tx(junk);
    const remaining = db.prepare("SELECT COUNT(*) c FROM crawl_queue WHERE url LIKE '%page=%' AND status != 'in-progress'").get().c;
    console.log(`\nDeleted ${junk.length} rows. Independent recount of ?page rows remaining: ${remaining}`);
  } else {
    console.log('\nNothing to delete.');
  }
} finally {
  db.close();
}
