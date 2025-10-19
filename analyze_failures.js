const { openDatabase } = require('./src/db/sqlite/v1/connection');

const db = openDatabase('./data/news.db', { readonly: true });

console.log('=== SAMPLE STORAGE FAILURE ANALYSIS ===');

const failures = db.prepare(`
  SELECT u.url, u.host, hr.http_status, hr.bytes_downloaded, hr.id as hr_id,
         cs.id as cs_id, cs.compression_type_id, LENGTH(cs.content_blob) as blob_size
  FROM urls u
  INNER JOIN http_responses hr ON u.id = hr.url_id
  LEFT JOIN content_storage cs ON hr.id = cs.http_response_id
  WHERE hr.http_status = 200
    AND (cs.id IS NULL OR cs.content_blob IS NULL)
    AND u.host = 'www.theguardian.com'
  LIMIT 5
`).all();

console.log('Sample Guardian storage failures:');
failures.forEach((f, i) => {
  console.log('  ' + (i+1) + '. URL: ' + f.url.substring(0, 80) + '...');
  console.log('     Status: ' + f.http_status + ', Downloaded: ' + f.bytes_downloaded + ' bytes');
  console.log('     HR ID: ' + f.hr_id + ', CS ID: ' + (f.cs_id || 'NULL'));
  console.log('     Compression Type: ' + (f.compression_type_id || 'NULL') + ', Blob Size: ' + (f.blob_size || 'NULL'));
  console.log('');
});

console.log('=== CHECKING FOR DUPLICATE STORAGE ATTEMPTS ===');
const duplicates = db.prepare(`
  SELECT http_response_id, COUNT(*) as count
  FROM content_storage
  GROUP BY http_response_id
  HAVING count > 1
  LIMIT 5
`).all();

console.log('Duplicate storage records for same http_response_id:');
duplicates.forEach(d => console.log('  HR ID ' + d.http_response_id + ': ' + d.count + ' storage records'));

// Check for placeholder records (NULL compression_type_id)
const placeholders = db.prepare(`
  SELECT COUNT(*) as count
  FROM content_storage
  WHERE compression_type_id IS NULL
  AND http_response_id IS NOT NULL
`).get().count;

console.log('Placeholder records (NULL compression_type_id): ' + placeholders);

db.close();