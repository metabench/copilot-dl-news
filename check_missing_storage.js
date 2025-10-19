const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });

console.log('=== HTTP Responses without Content Storage ===');
const missingStorage = db.prepare(`
  SELECT hr.id, hr.http_status, hr.bytes_downloaded, u.url
  FROM http_responses hr
  INNER JOIN urls u ON hr.url_id = u.id
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE cs.id IS NULL
  LIMIT 10
`).all();

console.log(`Found ${missingStorage.length} sample responses without storage:`);
missingStorage.forEach(row => {
  console.log(`ID: ${row.id}, Status: ${row.http_status}, Bytes: ${row.bytes_downloaded}, URL: ${row.url.substring(0, 80)}...`);
});

console.log('\n=== Check if these URLs have any storage at all ===');
const urlsWithStorage = db.prepare(`
  SELECT u.url, COUNT(cs.id) as storage_count
  FROM urls u
  INNER JOIN http_responses hr ON hr.url_id = u.id
  INNER JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE u.url IN (${missingStorage.map(() => '?').join(',')})
  GROUP BY u.url
`).all(missingStorage.map(r => r.url));

console.log(`URLs with storage: ${urlsWithStorage.length}`);
urlsWithStorage.forEach(row => {
  console.log(`URL: ${row.url.substring(0, 80)}..., Storage records: ${row.storage_count}`);
});

db.close();