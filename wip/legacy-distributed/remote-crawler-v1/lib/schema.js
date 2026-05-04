/**
 * Schema initialization - compatible with main repo schema patterns
 * 
 * Uses simplified subset of schema-definitions.js from main repo.
 * Results can be synced back to main DB.
 */

function initSchema(db) {
    db.exec(`
    -- URLs table (compatible with main repo urls table structure)
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT UNIQUE NOT NULL,
      host TEXT,
      path TEXT,
      status TEXT DEFAULT 'pending',  -- pending, fetching, done, error
      http_status INTEGER,
      content_type TEXT,
      content_length INTEGER,
      title TEXT,
      word_count INTEGER,
      links_found INTEGER DEFAULT 0,
      depth INTEGER DEFAULT 0,
      discovered_from TEXT,
      classification TEXT,  -- article, hub, other
      fetched_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      error_msg TEXT
    );
    
    CREATE INDEX IF NOT EXISTS idx_urls_status ON urls(status);
    CREATE INDEX IF NOT EXISTS idx_urls_host ON urls(host);
    CREATE INDEX IF NOT EXISTS idx_urls_classification ON urls(classification);
    
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
    
    -- Discovered links (for analysis)
    CREATE TABLE IF NOT EXISTS discovered_links (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_url_id INTEGER,
      target_url TEXT,
      link_text TEXT,
      is_nav_link INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (source_url_id) REFERENCES urls(id)
    );
  `);

    console.log('[Schema] Database initialized');
}

module.exports = { initSchema };
