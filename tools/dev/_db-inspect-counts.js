'use strict';
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const path = require('path');
const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');
const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
try {
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(r => r.name);
  console.log('TABLES:', tables.join(', '));
  const candidates = ['articles', 'http_responses', 'fetches', 'documents', 'pages', 'urls', 'downloads'];
  const counts = {};
  for (const t of tables) {
    if (candidates.includes(t) || /article|fetch|download|response|page|doc/i.test(t)) {
      try {
        const n = db.prepare(`SELECT COUNT(*) AS n FROM "${t}"`).get().n;
        counts[t] = n;
      } catch (e) { counts[t] = `ERR ${e.message}`; }
    }
  }
  console.log('COUNTS:', JSON.stringify(counts, null, 2));

  // Also: articles per day if articles table exists
  for (const t of Object.keys(counts)) {
    try {
      const cols = db.prepare(`PRAGMA table_info("${t}")`).all().map(c => c.name);
      const dateCol = cols.find(c => /^(fetched_at|created_at|published_at|date|crawled_at|inserted_at|first_seen|saved_at)$/i.test(c));
      if (dateCol) {
        const last = db.prepare(`SELECT date(${dateCol}) AS d, COUNT(*) AS n FROM "${t}" WHERE ${dateCol} IS NOT NULL GROUP BY date(${dateCol}) ORDER BY d DESC LIMIT 7`).all();
        console.log(`\n${t} (using ${dateCol}) — last 7 days with data:`, last);
      } else {
        console.log(`\n${t} — no obvious date column. Cols:`, cols.slice(0, 12).join(','));
      }
    } catch (e) { /* ignore */ }
  }
} finally { db.close(); }
