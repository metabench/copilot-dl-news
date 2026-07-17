'use strict';
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });
console.log('by method:', JSON.stringify(db.prepare(
  "SELECT validation_method, validation_status, COUNT(*) n FROM hub_validations GROUP BY 1,2 ORDER BY n DESC"
).all()));
console.log('recent crawl-written:', JSON.stringify(db.prepare(
  "SELECT domain, hub_url, validation_status, last_fetch_status, validated_at FROM hub_validations WHERE validation_method LIKE 'crawl%' ORDER BY validated_at DESC LIMIT 6"
).all(), null, 1));
db.close();
