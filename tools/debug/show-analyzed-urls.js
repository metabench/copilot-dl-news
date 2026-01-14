const { ensureDatabase } = require('../src/data/db/sqlite');

const dbPath = './data/news.db';
const db = ensureDatabase(dbPath);

// Get all 60 content_analysis records with version 1016
// Including their associated URLs
const query = `
  SELECT 
    ca.id as analysis_id,
    ca.content_id,
    u.url,
    ca.analysis_version,
    ca.word_count
  FROM content_analysis ca
  JOIN content_storage cs ON cs.id = ca.id
  JOIN http_responses hr ON hr.id = cs.http_response_id
  JOIN urls u ON u.id = hr.url_id
  WHERE ca.analysis_version = 1016
  ORDER BY ca.id
`;

console.log(`\n=== 60 Content Analyses (Analysis Version 1016) ===\n`);
const rows = db.prepare(query).all();
rows.forEach((row, i) => {
  console.log(`(${i + 1}/${rows.length}) ${row.url}`);
});

console.log(`\n=== Summary ===`);
console.log(`Total analyses: ${rows.length}`);
console.log(`Unique URLs: ${new Set(rows.map(r => r.url)).size}`);

db.close();
