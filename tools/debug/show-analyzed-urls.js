'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listAnalyzedUrlRowsByVersion
} = resolveNewsCrawlerDbModule();

async function main(version = 1016) {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    console.log(`\n=== Content Analyses (Analysis Version ${version}) ===\n`);
    const rows = listAnalyzedUrlRowsByVersion(db, { version });
    rows.forEach((row, index) => {
      console.log(`(${index + 1}/${rows.length}) ${row.url}`);
    });

    console.log('\n=== Summary ===');
    console.log(`Total analyses: ${rows.length}`);
    console.log(`Unique URLs: ${new Set(rows.map(row => row.url)).size}`);
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  main(Number(process.argv[2] || 1016)).catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = { main };
