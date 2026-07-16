'use strict';
// v2: look directly at errors / crawl_problems / crawl_log for the lemonde job.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });

const show = (label, sql) => {
  try { console.log(`\n== ${label}\n` + JSON.stringify(db.prepare(sql).all(), null, 1).slice(0, 1800)); }
  catch (e) { console.log(`\n== ${label}: ERR ${e.message}`); }
};

show('errors schema', "SELECT sql FROM sqlite_master WHERE name='errors'");
show('errors recent by kind', "SELECT kind, code, host, COUNT(*) n FROM errors WHERE at >= '2026-07-15T23:50' GROUP BY kind, code, host ORDER BY n DESC LIMIT 10");
show('errors lemonde sample', "SELECT * FROM errors WHERE host LIKE '%lemonde%' ORDER BY at DESC LIMIT 5");
show('crawl_problems schema', "SELECT sql FROM sqlite_master WHERE name='crawl_problems'");
show('crawl_problems recent', "SELECT kind, scope, COUNT(*) n FROM crawl_problems WHERE ts >= '2026-07-15T23:50' GROUP BY kind, scope ORDER BY n DESC LIMIT 10");
show('crawl_log lemonde', "SELECT * FROM crawl_log WHERE url LIKE '%lemonde%' ORDER BY rowid DESC LIMIT 5");
db.close();
