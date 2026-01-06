const db = require('better-sqlite3')('data/news.db');
const rows = db.prepare("SELECT COUNT(*) as c FROM place_names WHERE lang = 'es'").get();
console.log(rows);
