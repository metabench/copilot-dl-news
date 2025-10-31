const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });

const testUrl = 'https://www.theguardian.com/about';

console.log(`=== Analysis for URL: ${testUrl} ===`);

const httpResponses = db.prepare(`
  SELECT hr.id, hr.http_status, hr.bytes_downloaded, hr.fetched_at,
         cs.id as content_id, cs.storage_type, cs.uncompressed_size
  FROM http_responses hr
  INNER JOIN urls u ON hr.url_id = u.id
  LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
  WHERE u.url = ?
  ORDER BY hr.fetched_at DESC
`).all(testUrl);

console.log(`Total HTTP responses: ${httpResponses.length}`);
httpResponses.forEach((row, i) => {
  console.log(`${i+1}. ID: ${row.id}, Status: ${row.http_status}, Bytes: ${row.bytes_downloaded}, Content ID: ${row.content_id || 'NULL'}, Size: ${row.uncompressed_size || 'N/A'}`);
});

console.log(`\nStorage success rate: ${httpResponses.filter(r => r.content_id).length}/${httpResponses.length} (${((httpResponses.filter(r => r.content_id).length / httpResponses.length) * 100).toFixed(1)}%)`);

db.close();