const { getAllCountries, getTopCountries } = require('../../src/data/db/sqlite/queries/gazetteer.places');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
console.log('DB path:', dbPath);
const db = ensureDatabase(dbPath);

console.log('\nCountry query sample:');
const direct = getAllCountries(db).slice(0, 3).map(country => ({
  name: country.name,
  code: country.code
}));
console.log('Country query sample result:', direct);

console.log('\nTesting getAllCountries:');
const all = getAllCountries(db);
console.log(`Returned ${all.length} countries`);
console.log('First 3:', all.slice(0, 3));

console.log('\nTesting getTopCountries:');
const top = getTopCountries(db, 5);
console.log(`Returned ${top.length} countries`);
console.log('Top 5:', top);

db.close();

