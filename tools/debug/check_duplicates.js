const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const dbPath = path.resolve(__dirname, '..', '..', 'data', 'news.db');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

async function closeDb(db) {
  if (db && typeof db.close === 'function') {
    await db.close();
  }
}

async function main() {
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    const getDiagnostics = getDbApi('getContentStorageDuplicateDiagnostics');
    const diagnostics = getDiagnostics(db);
    const { storageCoverage } = diagnostics;
    const percent = storageCoverage.total_responses > 0
      ? storageCoverage.pct_with_storage.toFixed(1)
      : '0.0';

    console.log('URLs with multiple HTTP responses:');
    diagnostics.duplicateUrls.forEach(row => {
      console.log(`  ${row.url}: ${row.response_count} responses`);
    });

    console.log(
      `Storage coverage: ${storageCoverage.with_storage}/${storageCoverage.total_responses} responses have storage (${percent}%)`
    );

    console.log('\nSample HTTP responses without storage:');
    diagnostics.responsesWithoutStorage.forEach(row => {
      console.log(`  HR ${row.id}: ${row.url} (${row.http_status}, ${row.bytes_downloaded} bytes)`);
    });

    console.log('\nForeign keys on content_storage:');
    diagnostics.contentStorageForeignKeys.forEach(fk => {
      console.log(`  content_storage.${fk.from} -> ${fk.table}.${fk.to}`);
    });

    console.log('\nDuplicate http_response_id in content_storage:');
    diagnostics.duplicateContentStorageResponses.forEach(row => {
      console.log(`  HR ${row.http_response_id}: ${row.count} storage records`);
    });
  } finally {
    await closeDb(db);
  }
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
