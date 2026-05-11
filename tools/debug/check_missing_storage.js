
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
const { getMissingContentStorageDebugSnapshot } = resolveNewsCrawlerDbModule();

console.log('=== HTTP Responses without Content Storage ===');
const { missingStorage, urlsWithStorage } = getMissingContentStorageDebugSnapshot(db, { limit: 10 });

console.log(`Found ${missingStorage.length} sample responses without storage:`);
missingStorage.forEach(row => {
  console.log(`ID: ${row.id}, Status: ${row.http_status}, Bytes: ${row.bytes_downloaded}, URL: ${row.url.substring(0, 80)}...`);
});

console.log('\n=== Check if these URLs have any storage at all ===');
console.log(`URLs with storage: ${urlsWithStorage.length}`);
urlsWithStorage.forEach(row => {
  console.log(`URL: ${row.url.substring(0, 80)}..., Storage records: ${row.storage_count}`);
});

db.close();
