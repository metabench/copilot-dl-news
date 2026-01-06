const { createSQLiteDatabase } = require('../src/db/sqlite');

const db = createSQLiteDatabase('data/news.db');

const tlds = ['.co', '.ve', '.colombia', '.venezuela']; // .co is TLD for Colombia, .ve for Venezuela

console.log('Searching for domains ending in .co or .ve...');

const query = `
  SELECT count(*) as c FROM places WHERE country_code = 'CO'
`;

const result = db.db.prepare(query).get();
const fs = require('fs');

const output = [];
output.push(`Colombia places: ${result.c}`);
output.push(`Venezuela places: ${resultVE.c}`);

fs.writeFileSync('tmp/places-count.txt', output.join('\n'));
console.log('Written to tmp/places-count.txt');

