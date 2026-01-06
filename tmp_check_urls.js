const db = require('better-sqlite3')('data/news.db');
const domains = ['theguardian.com', 'eluniversal.com', 'bbc.com', 'lemonde.fr'];
console.log('Checking URL counts...');
for (const domain of domains) {
    const count = db.prepare("SELECT count(*) as count FROM urls WHERE host = ?").get(domain);
    console.log(`${domain}: ${count.count}`);
}

