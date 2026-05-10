
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb('data/news.db');
const row = db.prepare("SELECT COUNT(id) as c FROM urls WHERE host LIKE '%ottawacitizen%'").get();
console.log(`Ottawa Citizen Pages: ${row.c}`);
