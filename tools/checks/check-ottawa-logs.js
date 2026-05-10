
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb('data/news.db');
const logs = db.prepare("SELECT * FROM crawl_log WHERE message LIKE '%ottawacitizen%' ORDER BY id DESC LIMIT 10").all();
console.log(JSON.stringify(logs, null, 2));
