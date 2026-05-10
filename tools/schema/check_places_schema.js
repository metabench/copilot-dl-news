
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb('data/news.db', { readonly: true });
const stmt = db.prepare("PRAGMA table_info(places)");
console.log(JSON.stringify(stmt.all(), null, 2));
