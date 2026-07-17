'use strict';
// A3 driver: backfill hub_validations from verified mappings via ncdb
// backfillHubValidationsFromMappings. Run --apply with the app STOPPED.
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const { backfillHubValidationsFromMappings } = require('news-crawler-db');
const APPLY = process.argv.includes('--apply');
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: !APPLY });
if (APPLY) db.pragma('busy_timeout = 15000');

const before = db.prepare('SELECT COUNT(*) n FROM hub_validations').get().n;
const report = backfillHubValidationsFromMappings(db, { dryRun: !APPLY });
console.log(JSON.stringify(report));
console.log('ledger before:', before, 'after:',
  db.prepare('SELECT COUNT(*) n FROM hub_validations').get().n);
console.log('by method:', JSON.stringify(db.prepare(
  'SELECT validation_method m, COUNT(*) n FROM hub_validations GROUP BY m ORDER BY n DESC').all()));
db.close();
console.log(APPLY ? 'APPLY DONE' : 'DRY-RUN DONE');
