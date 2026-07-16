'use strict';
// Diagnose Le Monde's 5146-error crawl (job 143fc616, 2026-07-15) — read-only.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });

const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND (name LIKE '%fetch%' OR name LIKE '%error%' OR name LIKE '%crawl%')").all();
console.log('tables:', tables.map(t => t.name).join(', '));

for (const t of tables.map(t => t.name)) {
  const cols = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
  if (!cols.some(c => /url|host/.test(c))) continue;
  const urlCol = cols.find(c => c === 'url') || cols.find(c => /url/.test(c));
  if (!urlCol) continue;
  const timeCol = cols.find(c => /fetched_at|created_at|ts|time/.test(c));
  try {
    const rows = db.prepare(
      `SELECT ${cols.filter(c => /status|error|classification|note|reason/.test(c)).join(', ') || urlCol}, COUNT(*) n
       FROM ${t} WHERE ${urlCol} LIKE '%lemonde%'` +
      (timeCol ? ` AND ${timeCol} >= '2026-07-15T23:50'` : '') +
      ` GROUP BY 1 ORDER BY n DESC LIMIT 8`
    ).all();
    if (rows.length) console.log(`\n${t}:`, JSON.stringify(rows, null, 1));
  } catch (e) { console.log(`${t}: skip (${e.message})`); }
}

// sample recent lemonde fetch rows if a fetches table exists
try {
  const sample = db.prepare("SELECT url, http_status, classification, fetched_at FROM fetches WHERE url LIKE '%lemonde%' ORDER BY fetched_at DESC LIMIT 10").all();
  console.log('\nrecent fetches:', JSON.stringify(sample, null, 1));
} catch (e) { console.log('fetches sample: skip', e.message); }
db.close();
