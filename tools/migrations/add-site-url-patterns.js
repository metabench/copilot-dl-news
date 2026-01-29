'use strict';

/**
 * Migration: Add site_url_patterns table
 * 
 * Stores discovered URL patterns from site analysis.
 * Used to predict place hub URLs more accurately.
 */

const Database = require('better-sqlite3');
const path = require('path');

const dbPath = process.argv[2] || path.join(__dirname, '..', '..', 'data', 'news.db');

function up(db) {
  console.log('Creating site_url_patterns table...');
  
  db.exec(`
    CREATE TABLE IF NOT EXISTS site_url_patterns (
      id INTEGER PRIMARY KEY,
      host TEXT NOT NULL,
      pattern_type TEXT NOT NULL,       -- 'section', 'place-hub', 'topic-hub', 'article'
      path_template TEXT NOT NULL,      -- '/world/{place}', '/news/{topic}'
      first_segment TEXT,               -- 'world', 'news', etc.
      confidence REAL DEFAULT 0.0,      -- 0.0-1.0 based on evidence strength
      article_count INTEGER DEFAULT 0,  -- Articles matching this pattern
      child_count INTEGER DEFAULT 0,    -- Distinct child paths under this pattern
      example_urls TEXT,                -- JSON array of sample URLs
      discovered_at TEXT DEFAULT (datetime('now')),
      last_verified_at TEXT,
      is_active INTEGER DEFAULT 1,
      notes TEXT,
      UNIQUE(host, pattern_type, path_template)
    );
    
    CREATE INDEX IF NOT EXISTS idx_site_url_patterns_host 
    ON site_url_patterns(host);
    
    CREATE INDEX IF NOT EXISTS idx_site_url_patterns_type 
    ON site_url_patterns(pattern_type);
    
    CREATE INDEX IF NOT EXISTS idx_site_url_patterns_active 
    ON site_url_patterns(is_active);
  `);
  
  console.log('✅ site_url_patterns table created');
}

function down(db) {
  console.log('Dropping site_url_patterns table...');
  db.exec('DROP TABLE IF EXISTS site_url_patterns');
  console.log('✅ site_url_patterns table dropped');
}

// Run if executed directly
if (require.main === module) {
  const db = new Database(dbPath);
  const action = process.argv[3] || 'up';
  
  try {
    if (action === 'down') {
      down(db);
    } else {
      up(db);
    }
  } finally {
    db.close();
  }
}

module.exports = { up, down };
