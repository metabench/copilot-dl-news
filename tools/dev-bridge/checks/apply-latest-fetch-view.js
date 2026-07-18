'use strict';
// B11: create the latest_fetch view on the live DB from ncdb's canonical
// VIEW_STATEMENTS (3727b55). Five ncdb modules query this view; no schema
// path nor the live DB ever had it (urlListing fallbacks masked the gap).
// REQUIRES the Electron app stopped. Default DRY-RUN; --apply creates.
const path = require('path');
const APPLY = process.argv.includes('--apply');
const ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(path.join(ROOT, '..', 'news-crawler-db', 'node_modules', 'better-sqlite3'));
const { SQLITE_V1_SCHEMA_VIEW_STATEMENTS } = require('news-crawler-db');

const canonical = SQLITE_V1_SCHEMA_VIEW_STATEMENTS.find((s) => s.includes('latest_fetch'));
if (!canonical) throw new Error('canonical latest_fetch view statement not found on ncdb');

const db = new Database(path.join(ROOT, 'data', 'news.db'), { readonly: !APPLY, fileMustExist: true });
const existing = db.prepare("SELECT sql FROM sqlite_master WHERE type='view' AND name='latest_fetch'").get();
console.log('installed:', existing ? 'present' : 'ABSENT');

if (!APPLY) {
  console.log('dry-run: pass --apply (app stopped) to create the view');
} else {
  db.exec(canonical);
  const after = db.prepare("SELECT sql FROM sqlite_master WHERE type='view' AND name='latest_fetch'").get();
  const probe = db.prepare('SELECT COUNT(*) n FROM latest_fetch').get();
  console.log(after ? `APPLIED; latest_fetch rows: ${probe.n}` : 'ERROR: view absent post-apply');
  if (!after) process.exitCode = 1;
}
db.close();
