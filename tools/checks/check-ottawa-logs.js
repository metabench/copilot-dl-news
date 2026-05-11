'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

const {
  listCrawlLogRowsMatchingMessage
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    const logs = listCrawlLogRowsMatchingMessage(db, '%ottawacitizen%', { limit: 10 });
    console.log(JSON.stringify(logs, null, 2));
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
