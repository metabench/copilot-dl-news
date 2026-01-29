const Database = require('better-sqlite3');
const db = new Database('data/news.db');

try {
    db.exec(`
    -- Crawl runs for tracking
    CREATE TABLE IF NOT EXISTS crawl_runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_domain TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      total_fetched INTEGER DEFAULT 0,
      total_errors INTEGER DEFAULT 0,
      status TEXT DEFAULT 'running'
    );
    
    -- Logs
    CREATE TABLE IF NOT EXISTS crawl_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      run_id INTEGER,
      level TEXT,
      message TEXT,
      data TEXT,
      ts DATETIME DEFAULT CURRENT_TIMESTAMP
    );
    `);
    console.log('Tables created or already exist.');
} catch (e) {
    console.error('Migration failed:', e.message);
}
