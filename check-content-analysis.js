const db = require('better-sqlite3')('data/news.db');
try {
  const result = db.prepare(`SELECT COUNT(*) as cnt FROM content_analysis`).get();
  console.log('Records in content_analysis:', result.cnt);
} catch (e) {
  console.log('Error:', e.message);
}
db.close();
