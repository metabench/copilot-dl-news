const db = require('better-sqlite3')('data/news.db');
const rows = db.prepare("SELECT lang, COUNT(*) as c FROM place_names GROUP BY lang").all();
console.log(rows);
