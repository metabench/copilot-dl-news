const Database = require('better-sqlite3');
const db = new Database('data/news.db');
const schema = db.prepare("PRAGMA table_info(urls)").all();
console.log(schema.map(c => c.name).join(', '));
