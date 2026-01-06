const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });
const stmt = db.prepare("PRAGMA table_info(place_hubs)");
console.log(JSON.stringify(stmt.all(), null, 2));
console.log('---');
const stmt2 = db.prepare("PRAGMA table_info(place_hubs_with_urls)");
console.log(JSON.stringify(stmt2.all(), null, 2));
