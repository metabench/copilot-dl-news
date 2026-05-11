'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function printHubSchema(dbPath = 'data/news.db') {
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    console.log('--- place_hubs ---');
    console.log(await db.maintenance.getTableDefinitionSql('place_hubs'));
    console.log('--- place_hub_candidates ---');
    console.log(await db.maintenance.getTableDefinitionSql('place_hub_candidates'));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  printHubSchema().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  printHubSchema
};
