const db = require('better-sqlite3')('data/news.db');
const rows = db.prepare('SELECT id, url FROM articles WHERE analysis_version = 1016 ORDER BY id LIMIT 60').all();
rows.forEach((r, i) => {
  console.log(`(${i+1}/60) ${r.url}`);
});
db.close();
