const Database = require('better-sqlite3');
const db = new Database('data/news.db');
const row = db.prepare("SELECT COUNT(id) as c FROM urls WHERE host LIKE '%ottawacitizen%'").get();
console.log(`Ottawa Citizen Pages: ${row.c}`);
