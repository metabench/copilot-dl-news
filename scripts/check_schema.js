const Database = require('better-sqlite3');
const db = new Database('data/news.db', { readonly: true });

console.log('=== Content Storage Schema ===');
const schema = db.prepare(`PRAGMA table_info(content_storage)`).all();
console.log(schema);

console.log('\n=== Content Storage Indexes ===');
const indexes = db.prepare(`PRAGMA index_list(content_storage)`).all();
console.log(indexes);

console.log('\n=== Foreign Keys ===');
const fks = db.prepare(`PRAGMA foreign_key_list(content_storage)`).all();
console.log(fks);

console.log('\n=== Sample duplicate content_storage records ===');
const duplicates = db.prepare(`
  SELECT http_response_id, COUNT(*) as count
  FROM content_storage
  GROUP BY http_response_id
  HAVING COUNT(*) > 1
  LIMIT 5
`).all();
console.log(duplicates);

db.close();