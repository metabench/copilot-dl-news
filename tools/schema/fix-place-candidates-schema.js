const db = require('better-sqlite3')('data/news.db');

try {
  console.log('Dropping old place_hub_candidates table...');
  db.prepare('DROP TABLE IF EXISTS place_hub_candidates').run();

  console.log('Creating new place_hub_candidates table...');
  db.prepare(`
    CREATE TABLE place_hub_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      candidate_url TEXT NOT NULL,
      normalized_url TEXT,
      place_kind TEXT,
      place_name TEXT,
      place_code TEXT,
      place_id INTEGER,
      analyzer TEXT,
      strategy TEXT,
      score REAL,
      confidence REAL,
      pattern TEXT,
      signals_json TEXT,
      attempt_id TEXT,
      attempt_started_at TEXT,
      status TEXT DEFAULT 'pending',
      validation_status TEXT,
      source TEXT DEFAULT 'guess-place-hubs',
      last_seen_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `).run();

  console.log('Creating unique index...');
  db.prepare(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_place_hub_candidates_domain_url 
    ON place_hub_candidates(domain, candidate_url)
  `).run();

  console.log('Schema migration complete.');
} catch (err) {
  console.error('Migration failed:', err);
  process.exit(1);
}
