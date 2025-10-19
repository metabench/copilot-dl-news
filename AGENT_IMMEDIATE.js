const Database = require('better-sqlite3');
const path = require('path');

// Connect to dev database
const dbPath = path.join(__dirname, 'data/dev.db');
const db = new Database(dbPath);

console.log('Populating dev.db with test data...');

// Create urls table if it doesn't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS urls (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL,
    last_seen_at TEXT NOT NULL
  );
`);

// Create test tables with migration schema (simplified for testing)
db.exec(`
  CREATE TABLE IF NOT EXISTS links (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    src_url TEXT,
    dst_url TEXT,
    src_url_id INTEGER,
    dst_url_id INTEGER,
    FOREIGN KEY (src_url_id) REFERENCES urls(id),
    FOREIGN KEY (dst_url_id) REFERENCES urls(id)
  );

  CREATE TABLE IF NOT EXISTS queue_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    job_id TEXT NOT NULL,
    ts TEXT NOT NULL,
    action TEXT NOT NULL,
    url TEXT,
    url_id INTEGER,
    FOREIGN KEY (url_id) REFERENCES urls(id)
  );

  CREATE TABLE IF NOT EXISTS crawl_jobs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    url_id INTEGER,
    FOREIGN KEY (url_id) REFERENCES urls(id)
  );

  CREATE TABLE IF NOT EXISTS errors (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    url_id INTEGER,
    FOREIGN KEY (url_id) REFERENCES urls(id)
  );

  CREATE TABLE IF NOT EXISTS url_aliases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    url TEXT,
    alias_url TEXT,
    url_id INTEGER,
    alias_url_id INTEGER,
    FOREIGN KEY (url_id) REFERENCES urls(id),
    FOREIGN KEY (alias_url_id) REFERENCES urls(id)
  );
`);

// Insert test data
const now = new Date().toISOString();

db.prepare('INSERT OR IGNORE INTO urls (url, created_at, last_seen_at) VALUES (?, ?, ?)').run('https://example.com/page1', now, now);
db.prepare('INSERT OR IGNORE INTO urls (url, created_at, last_seen_at) VALUES (?, ?, ?)').run('https://example.com/page2', now, now);
db.prepare('INSERT OR IGNORE INTO urls (url, created_at, last_seen_at) VALUES (?, ?, ?)').run('https://news.example.com/article1', now, now);

db.prepare('INSERT INTO links (src_url, dst_url) VALUES (?, ?)').run('https://example.com/page1', 'https://example.com/page2');
db.prepare('INSERT INTO links (src_url, dst_url) VALUES (?, ?)').run('https://example.com/page2', 'https://news.example.com/article1');

db.prepare('INSERT INTO queue_events (job_id, ts, action, url) VALUES (?, ?, ?, ?)').run('test-job-1', now, 'discovered', 'https://example.com/page1');
db.prepare('INSERT INTO crawl_jobs (url) VALUES (?)').run('https://news.example.com/article1');
db.prepare('INSERT INTO errors (url) VALUES (?)').run('https://example.com/page2');
db.prepare('INSERT INTO url_aliases (url, alias_url) VALUES (?, ?)').run('https://example.com/page1', 'https://example.com/p1');

db.close();

console.log('✅ Test data populated in dev.db');
