const { ensureDatabase } = require('../src/data/db/sqlite');
const db = ensureDatabase('./data/news.db');
const results = db.prepare("SELECT name, normalized, lang FROM place_names WHERE normalized = '' AND name != '' LIMIT 10").all();
console.log('Examples of names with empty normalized:');
results.forEach(r => console.log(`Name: '${r.name}' Lang: ${r.lang} Normalized: '${r.normalized}'`));
db.close();