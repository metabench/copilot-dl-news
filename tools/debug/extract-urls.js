const db = require('better-sqlite3')('data/news.db');
// Extract URLs from normalized schema that have been analyzed, ordered by most recent analysis
const rows = db.prepare(`
  SELECT u.id, u.url, ca.analyzed_at
  FROM urls u
  JOIN content_storage cs ON cs.url_id = u.id
  JOIN content_analysis ca ON ca.content_id = cs.id
  WHERE ca.analysis_version > 1  -- Has been analyzed (not just default)
  ORDER BY ca.analyzed_at DESC   -- Most recently analyzed first
  LIMIT 60
`).all();
rows.forEach((r, i) => {
  console.log(`(${i+1}/60) ${r.url} (analyzed: ${r.analyzed_at})`);
});
db.close();
