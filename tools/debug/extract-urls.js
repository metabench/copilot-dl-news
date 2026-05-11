'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listRecentlyAnalyzedUrlDebugRows
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    const rows = listRecentlyAnalyzedUrlDebugRows(db, { limit: 60, minAnalysisVersion: 2 });
    rows.forEach((row, index) => {
      console.log(`(${index + 1}/60) ${row.url} (analyzed: ${row.analyzed_at})`);
    });
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { main };
