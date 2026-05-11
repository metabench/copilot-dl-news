'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listPlaceNamesWithEmptyNormalized
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    const results = listPlaceNamesWithEmptyNormalized(db, { limit: 10 });
    console.log('Examples of names with empty normalized:');
    results.forEach(row => console.log(`Name: '${row.name}' Lang: ${row.lang} Normalized: '${row.normalized}'`));
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
