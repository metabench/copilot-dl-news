'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getDiagnosticsApi() {
  const dbModule = resolveNewsCrawlerDbModule();
  if (typeof dbModule.getStorageFailureAnalysisSnapshot !== 'function') {
    throw new Error('news-crawler-db does not export getStorageFailureAnalysisSnapshot. Build ../news-crawler-db first.');
  }
  return dbModule;
}

function main() {
  const db = openNewsCrawlerDb('./data/news.db', { readonly: true, fileMustExist: true });

  try {
    const { getStorageFailureAnalysisSnapshot } = getDiagnosticsApi();
    const snapshot = getStorageFailureAnalysisSnapshot(db, {
      host: 'www.theguardian.com',
      failureLimit: 5,
      duplicateLimit: 5
    });

    console.log('=== SAMPLE STORAGE FAILURE ANALYSIS ===');
    console.log('Sample Guardian storage failures:');
    snapshot.failures.forEach((failure, index) => {
      console.log('  ' + (index + 1) + '. URL: ' + failure.url.substring(0, 80) + '...');
      console.log('     Status: ' + failure.http_status + ', Downloaded: ' + failure.bytes_downloaded + ' bytes');
      console.log('     HR ID: ' + failure.hr_id + ', CS ID: ' + (failure.cs_id || 'NULL'));
      console.log('     Compression Type: ' + (failure.compression_type_id || 'NULL') + ', Blob Size: ' + (failure.blob_size || 'NULL'));
      console.log('');
    });

    console.log('=== CHECKING FOR DUPLICATE STORAGE ATTEMPTS ===');
    console.log('Duplicate storage records for same http_response_id:');
    snapshot.duplicates.forEach((duplicate) => {
      console.log('  HR ID ' + duplicate.http_response_id + ': ' + duplicate.count + ' storage records');
    });

    console.log('Placeholder records (NULL compression_type_id): ' + snapshot.placeholders);
  } finally {
    db.close();
  }
}

if (require.main === module) {
  main();
}

module.exports = { main };
