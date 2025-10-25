const { ensureDatabase } = require('./src/db/sqlite/v1');
const db = ensureDatabase('./data/news.db');
console.log('Tables:', db.prepare('SELECT name FROM sqlite_master WHERE type=\'table\'').all().map(t => t.name));
db.close();