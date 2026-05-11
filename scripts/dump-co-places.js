'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');

const {
  listTopPlacesByCountryCode
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    const places = listTopPlacesByCountryCode(db, 'CO', { limit: 20 });
    console.log('Top Colombian Places:');
    places.forEach(place => console.log(`${place.kind}: ${place.name}`));
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
