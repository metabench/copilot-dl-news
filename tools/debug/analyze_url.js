'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listUrlHttpResponseDebugRows
} = resolveNewsCrawlerDbModule();

const testUrl = 'https://www.theguardian.com/about';

async function main(url = testUrl) {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    console.log(`=== Analysis for URL: ${url} ===`);
    const httpResponses = listUrlHttpResponseDebugRows(db, url);
    console.log(`Total HTTP responses: ${httpResponses.length}`);
    httpResponses.forEach((row, index) => {
      console.log(`${index + 1}. ID: ${row.id}, Status: ${row.http_status}, Bytes: ${row.bytes_downloaded}, Content ID: ${row.content_id || 'NULL'}, Size: ${row.uncompressed_size || 'N/A'}`);
    });

    const storedCount = httpResponses.filter(row => row.content_id).length;
    const rate = httpResponses.length ? ((storedCount / httpResponses.length) * 100).toFixed(1) : '0.0';
    console.log(`\nStorage success rate: ${storedCount}/${httpResponses.length} (${rate}%)`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main(process.argv[2] || testUrl).catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { main };
