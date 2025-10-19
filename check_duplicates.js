const { ensureDatabase } = require('./src/db/sqlite');
const db = ensureDatabase('./data/news.db');

// Check for URLs with multiple HTTP responses
const duplicates = db.prepare(`
  SELECT u.url, COUNT(hr.id) as response_count
  FROM urls u
  INNER JOIN http_responses hr ON hr.url_id = u.id
  GROUP BY u.url
  HAVING COUNT(hr.id) > 1
  ORDER BY response_count DESC
  LIMIT 10
`).all();

console.log('URLs with multiple HTTP responses:');
duplicates.forEach(row => {
  console.log(`  ${row.url}: ${row.response_count} responses`);
});

// Check storage coverage
const withStorage = db.prepare(`
  SELECT COUNT(*) as total_responses,
         COUNT(CASE WHEN cs.id IS NOT NULL THEN 1 END) as with_storage
  FROM http_responses hr
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
`).get();

console.log(`Storage coverage: ${withStorage.with_storage}/${withStorage.total_responses} responses have storage (${((withStorage.with_storage/withStorage.total_responses)*100).toFixed(1)}%)`);

// Check for responses without storage
const withoutStorage = db.prepare(`
  SELECT hr.id, u.url, hr.http_status, hr.bytes_downloaded
  FROM http_responses hr
  INNER JOIN urls u ON u.id = hr.url_id
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE cs.id IS NULL AND hr.http_status >= 200 AND hr.http_status < 300
  LIMIT 10
`).all();

console.log('\nSample HTTP responses without storage:');
withoutStorage.forEach(row => {
  console.log(`  HR ${row.id}: ${row.url} (${row.http_status}, ${row.bytes_downloaded} bytes)`);
});

// Check foreign key constraints
const fks = db.prepare('PRAGMA foreign_key_list(content_storage)').all();
console.log('\nForeign keys on content_storage:');
fks.forEach(fk => {
  console.log(`  ${fk.table}.${fk.from} -> ${fk.table}.${fk.to}`);
});

// Check for duplicate http_response_id in content_storage
const storageDuplicates = db.prepare(`
  SELECT http_response_id, COUNT(*) as count
  FROM content_storage
  GROUP BY http_response_id
  HAVING COUNT(*) > 1
  ORDER BY count DESC
  LIMIT 5
`).all();

console.log('\nDuplicate http_response_id in content_storage:');
storageDuplicates.forEach(row => {
  console.log(`  HR ${row.http_response_id}: ${row.count} storage records`);
});