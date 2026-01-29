// Seed URLs for AP News crawl
const db = require('better-sqlite3')('data/crawl-apnews_com.db');

const urls = [
    'https://apnews.com',
    'https://apnews.com/hub/world-news',
    'https://apnews.com/hub/us-news',
    'https://apnews.com/hub/politics',
    'https://apnews.com/hub/business',
    'https://apnews.com/hub/technology',
    'https://apnews.com/hub/sports',
    'https://apnews.com/hub/science',
    'https://apnews.com/hub/entertainment',
    'https://apnews.com/hub/health'
];

const stmt = db.prepare('INSERT OR IGNORE INTO urls (url, host, path, status, depth) VALUES (?, ?, ?, ?, ?)');

let inserted = 0;
for (const url of urls) {
    try {
        const u = new URL(url);
        const info = stmt.run(url, u.hostname, u.pathname, 'pending', 0);
        if (info.changes > 0) inserted++;
    } catch (e) {
        console.log('Error:', e.message);
    }
}

console.log(`Seeded ${inserted}/${urls.length} URLs`);
const pending = db.prepare('SELECT COUNT(*) as c FROM urls WHERE status=\'pending\'').get();
console.log(`Total pending: ${pending.c}`);

db.close();
