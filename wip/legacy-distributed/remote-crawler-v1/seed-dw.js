// Seed URLs for DW crawl - Single entry point for discovery
const db = require('better-sqlite3')('data/crawl-www_dw_com.db');

// Ensure schema exists
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT UNIQUE NOT NULL,
    host TEXT,
    path TEXT,
    status TEXT DEFAULT 'pending',
    http_status INTEGER,
    content_type TEXT,
    content_length INTEGER,
    title TEXT,
    word_count INTEGER,
    links_found INTEGER DEFAULT 0,
    depth INTEGER DEFAULT 0,
    discovered_from TEXT,
    classification TEXT,
    fetched_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    error_msg TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_urls_status ON urls(status);
`);

// Only seed the homepage - let the crawler discover the rest
const urls = [
    'https://www.dw.com/en'
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
const pending = db.prepare("SELECT COUNT(*) as c FROM urls WHERE status='pending'").get();
console.log(`Total pending: ${pending.c}`);

db.close();
