const path = require('path');
const Database = require('better-sqlite3');

const dbPath = path.join(__dirname, '../../../../data/news.db');
const db = new Database(dbPath);

const query = `
SELECT 
  u.url, 
  ca.content_id,
  cs.storage_type,
  cs.compression_type_id,
  cs.compression_bucket_id,
  cs.bucket_entry_key,
  cs.content_blob,
  ct.algorithm as compression_algorithm
FROM content_analysis ca
JOIN content_storage cs ON ca.content_id = cs.id
LEFT JOIN compression_types ct ON cs.compression_type_id = ct.id
JOIN http_responses hr ON cs.http_response_id = hr.id
JOIN urls u ON hr.url_id = u.id
WHERE u.url LIKE '%snow-gaza-wolf-supermoon%'
`;

const row = db.prepare(query).get();

if (row) {
  // Don't print the blob
  const { content_blob, ...rest } = row;
  console.log(JSON.stringify({ ...rest, has_blob: !!content_blob, blob_size: content_blob ? content_blob.length : 0 }, null, 2));
} else {
  console.log('Not found');
}
