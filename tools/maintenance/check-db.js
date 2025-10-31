const { ensureDatabase } = require('./src/db/sqlite/v1');
const db = ensureDatabase('./data/news.db');
console.log('Tables:', db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map(t => t.name));
console.log('HTTP Response count:', db.prepare("SELECT COUNT(*) as count FROM http_responses").get().count);
console.log('Content Analysis count:', db.prepare("SELECT COUNT(*) as count FROM content_analysis").get().count);
console.log('Place count:', db.prepare("SELECT COUNT(*) as count FROM places").get().count);

// Get a sample article with title
const sampleArticle = db.prepare(`
  SELECT hr.id, ca.title
  FROM http_responses hr
  LEFT JOIN content_analysis ca ON hr.id = ca.content_id
  WHERE ca.title IS NOT NULL AND ca.title != ''
  LIMIT 1
`).get();

if (sampleArticle) {
  console.log('Sample article:', sampleArticle);
} else {
  console.log('No articles with titles found');
}
db.close();