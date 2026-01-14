const { getAllCountries, getTopCountries } = require('../../src/data/db/sqlite/queries/gazetteer.places');
const { ensureDatabase } = require('../../src/data/db/sqlite');
const path = require('path');

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
console.log('DB path:', dbPath);
const db = ensureDatabase(dbPath);

console.log('\nDirect query test:');
const direct = db.prepare(`
  SELECT 
    pn.name,
    p.country_code as code
  FROM places p
  LEFT JOIN place_names pn ON p.id = pn.place_id AND pn.is_preferred = 1
  WHERE p.kind = 'country'
    AND pn.name IS NOT NULL
    AND p.country_code IS NOT NULL
  LIMIT 3
`).all();
console.log('Direct query result:', direct);

console.log('\nTesting getAllCountries:');
const all = getAllCountries(db);
console.log(`Returned ${all.length} countries`);
console.log('First 3:', all.slice(0, 3));

console.log('\nTesting getTopCountries:');
const top = getTopCountries(db, 5);
console.log(`Returned ${top.length} countries`);
console.log('Top 5:', top);

db.close();

