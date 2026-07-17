'use strict';
const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const db = new Database(path.join(REPO_ROOT, 'data', 'news.db'), { readonly: true, timeout: 5000 });
console.log('domain_locales schema:', db.prepare("SELECT sql FROM sqlite_master WHERE name='domain_locales'").get()?.sql);
console.log('domain_locales rows:', JSON.stringify(db.prepare('SELECT * FROM domain_locales LIMIT 5').all()));
console.log('news_websites sample:', JSON.stringify(db.prepare('SELECT id, url, label, parent_domain, metadata FROM news_websites LIMIT 5').all(), null, 1).slice(0, 900));
console.log('with metadata:', db.prepare("SELECT COUNT(*) c FROM news_websites WHERE metadata IS NOT NULL AND metadata != ''").get().c, '/', db.prepare('SELECT COUNT(*) c FROM news_websites').get().c);
db.close();
