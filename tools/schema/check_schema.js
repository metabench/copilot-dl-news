'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function printPlaceHubSchema(dbPath = 'data/news.db') {
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    const placeHubs = await db.maintenance.getTableInfo('place_hubs');
    const placeHubsWithUrls = await db.maintenance.getTableInfo('place_hubs_with_urls');
    console.log(JSON.stringify(placeHubs, null, 2));
    console.log('---');
    console.log(JSON.stringify(placeHubsWithUrls, null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  printPlaceHubSchema().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  printPlaceHubSchema
};
