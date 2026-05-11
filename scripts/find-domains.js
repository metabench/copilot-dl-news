'use strict';

const fs = require('fs');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');

const {
  countPlacesByCountryCode
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb('data/news.db', { readonly: true, fileMustExist: true });
  try {
    console.log('Searching for domains ending in .co or .ve...');
    const output = [
      `Colombia places: ${countPlacesByCountryCode(db, 'CO')}`,
      `Venezuela places: ${countPlacesByCountryCode(db, 'VE')}`
    ];
    fs.writeFileSync('tmp/places-count.txt', output.join('\n'));
    console.log('Written to tmp/places-count.txt');
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
