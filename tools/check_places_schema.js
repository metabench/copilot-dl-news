const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });
const stmt = db.prepare("PRAGMA table_info(places)");
console.log(JSON.stringify(stmt.all(), null, 2));
