'use strict';

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

async function printPlacesSchema(dbPath = 'data/news.db') {
  const db = openNewsCrawlerDb(dbPath, { readonly: true, fileMustExist: true });
  try {
    const places = await db.maintenance.getTableInfo('places');
    console.log(JSON.stringify(places, null, 2));
  } finally {
    await db.close();
  }
}

if (require.main === module) {
  printPlacesSchema().catch(error => {
    console.error(error && error.stack ? error.stack : error);
    process.exitCode = 1;
  });
}

module.exports = {
  printPlacesSchema
};
