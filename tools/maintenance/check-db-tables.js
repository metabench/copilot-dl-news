const db = require('better-sqlite3')('data/news.db');
const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table'`).all();
console.log('Tables in database:');
tables.forEach(t => console.log(`  ${t.name}`));
db.close();
