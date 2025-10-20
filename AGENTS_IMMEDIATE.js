const { ensureDatabase } = require('./src/db/sqlite');
const db = ensureDatabase('./data/news.db');
const rows = db.prepare('SELECT url, http_status, fetched_at FROM urls u LEFT JOIN http_responses hr ON hr.url_id = u.id WHERE http_status = 404 LIMIT 5').all();
console.log('Sample 404 entries:');
rows.forEach(row => console.log(JSON.stringify(row)));