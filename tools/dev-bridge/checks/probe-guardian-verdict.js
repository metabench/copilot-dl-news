'use strict';
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });
console.log('guardian hub_validations (recent):', JSON.stringify(db.prepare(
  "SELECT hub_url, validation_status, last_fetch_status, validation_method, validated_at FROM hub_validations WHERE domain='theguardian.com' ORDER BY validated_at DESC LIMIT 5"
).all(), null, 1));
console.log('guardian policy evidence:', JSON.stringify(db.prepare(
  "SELECT evidence, updated_at FROM domain_fetch_policies WHERE host='theguardian.com'"
).get()));
db.close();
