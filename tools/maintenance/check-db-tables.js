'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function main(dbPath = 'data/news.db') {
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    const tables = await db.maintenance.listTables();
    console.log('Tables in database:');
    tables.forEach(name => console.log(`  ${name}`));
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
