'use strict';
// Read-only audit: which site/geo tables exist in news.db and the standalone
// gazetteer DBs, with row counts. For the "all data in the DB" review.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));

const audit = (label, file) => {
  console.log(`\n===== ${label}`);
  let db;
  try { db = new Database(file, { readonly: true, timeout: 5000 }); }
  catch (e) { console.log('  open failed:', e.message); return; }
  try {
    const tables = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all().map(t => t.name);
    const interesting = tables.filter(t => /site|source|website|domain|place|gazetteer|country|region|geo|hub/i.test(t));
    console.log('  tables total:', tables.length, '| site/geo-ish:', interesting.length);
    for (const t of interesting) {
      let n = '?';
      try { n = db.prepare(`SELECT COUNT(*) c FROM "${t}"`).get().c; } catch (_) {}
      console.log(`   ${t}: ${n}`);
    }
  } finally { try { db.close(); } catch (_) {} }
};

audit('news.db', path.join(REPO_ROOT, 'data', 'news.db'));
audit('gazetteer.db', path.join(REPO_ROOT, 'data', 'gazetteer.db'));
audit('gazetteer-standalone.db', path.join(REPO_ROOT, 'data', 'gazetteer-standalone.db'));
audit('crawl-multi.db', path.join(REPO_ROOT, 'data', 'crawl-multi.db'));
