const Database = require('better-sqlite3');
const db = new Database('./data/test.db');

console.log('Article-related tables:');
const result = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\' AND name LIKE \'%article%\'').all();
console.log(result.map(t => t.name));

console.log('\nAll tables:');
const allTables = db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all();
console.log(allTables.map(t => t.name));

db.close();