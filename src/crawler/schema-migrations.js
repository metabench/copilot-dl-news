/**
 * Schema migrations for Quick Win components
 * 
 * Adds tables needed by:
 * - BudgetAllocator (hub_performance)
 * - TemporalPatternLearner (hub_visits, temporal_patterns)
 * 
 * Can be run safely multiple times (idempotent)
 */

/**
 * Apply Quick Win schema migrations to database
 * @param {object} db - better-sqlite3 database instance
 */
function applyQuickWinMigrations(db) {
  // Hub Performance table for BudgetAllocator
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_performance (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      hub_url TEXT NOT NULL,
      hub_type TEXT NOT NULL,
      articles_found INTEGER NOT NULL DEFAULT 0,
      depth_explored INTEGER NOT NULL DEFAULT 1,
      efficiency REAL NOT NULL DEFAULT 0,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(domain, hub_url)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hub_performance_domain 
    ON hub_performance(domain)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hub_performance_type 
    ON hub_performance(hub_type)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hub_performance_efficiency 
    ON hub_performance(efficiency DESC)
  `);

  // Hub Visits table for TemporalPatternLearner
  db.exec(`
    CREATE TABLE IF NOT EXISTS hub_visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      hub_url TEXT NOT NULL,
      hub_type TEXT NOT NULL,
      visited_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      articles_found INTEGER NOT NULL DEFAULT 0,
      new_articles INTEGER NOT NULL DEFAULT 0
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hub_visits_domain_hub 
    ON hub_visits(domain, hub_url)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_hub_visits_visited_at 
    ON hub_visits(visited_at DESC)
  `);

  // Temporal Patterns table for TemporalPatternLearner
  db.exec(`
    CREATE TABLE IF NOT EXISTS temporal_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      hub_url TEXT NOT NULL,
      hub_type TEXT NOT NULL,
      frequency TEXT NOT NULL,
      confidence REAL NOT NULL DEFAULT 0,
      avg_new_articles REAL NOT NULL DEFAULT 0,
      pattern_data TEXT,
      updated_at INTEGER NOT NULL DEFAULT (strftime('%s', 'now')),
      UNIQUE(domain, hub_url)
    )
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_temporal_patterns_domain 
    ON temporal_patterns(domain)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_temporal_patterns_frequency 
    ON temporal_patterns(frequency)
  `);

  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_temporal_patterns_confidence 
    ON temporal_patterns(confidence DESC)
  `);

  return {
    applied: true,
    tables: ['hub_performance', 'hub_visits', 'temporal_patterns'],
    indexes: [
      'idx_hub_performance_domain',
      'idx_hub_performance_type', 
      'idx_hub_performance_efficiency',
      'idx_hub_visits_domain_hub',
      'idx_hub_visits_visited_at',
      'idx_temporal_patterns_domain',
      'idx_temporal_patterns_frequency',
      'idx_temporal_patterns_confidence'
    ]
  };
}

/**
 * Check if Quick Win tables exist
 * @param {object} db - better-sqlite3 database instance
 */
function checkQuickWinSchema(db) {
  const tables = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type='table' AND name IN ('hub_performance', 'hub_visits', 'temporal_patterns')
  `).all();

  return {
    hub_performance: tables.some(t => t.name === 'hub_performance'),
    hub_visits: tables.some(t => t.name === 'hub_visits'),
    temporal_patterns: tables.some(t => t.name === 'temporal_patterns'),
    allPresent: tables.length === 3
  };
}

module.exports = {
  applyQuickWinMigrations,
  checkQuickWinSchema
};
