'use strict';

/**
 * Migration: Add FTS5 full-text search for articles
 * 
 * Adds:
 *   1. body_text, byline, authors columns to content_analysis
 *   2. articles_fts FTS5 virtual table for full-text search
 *   3. Triggers to keep FTS index in sync
 *   4. Indexes for faceted filtering
 */

const MIGRATION_VERSION = 40;
const MIGRATION_NAME = 'add_fts5_article_search';

/**
 * Check if a column exists in a table
 */
function columnExists(db, table, column) {
  const info = db.pragma(`table_info(${table})`);
  return info.some(col => col.name === column);
}

/**
 * Check if a table/virtual table exists
 */
function tableExists(db, tableName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type IN ('table', 'shadow') AND name = ?
  `).get(tableName);
  return !!result;
}

/**
 * Check if a trigger exists
 */
function triggerExists(db, triggerName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'trigger' AND name = ?
  `).get(triggerName);
  return !!result;
}

/**
 * Check if an index exists
 */
function indexExists(db, indexName) {
  const result = db.prepare(`
    SELECT name FROM sqlite_master 
    WHERE type = 'index' AND name = ?
  `).get(indexName);
  return !!result;
}

/**
 * Apply the migration
 */
function up(db) {
  const results = {
    columnsAdded: [],
    tablesCreated: [],
    triggersCreated: [],
    indexesCreated: [],
    errors: []
  };

  // Step 1: Add new columns to content_analysis
  const columnsToAdd = [
    { name: 'body_text', type: 'TEXT' },
    { name: 'byline', type: 'TEXT' },
    { name: 'authors', type: 'TEXT' }
  ];

  for (const col of columnsToAdd) {
    if (!columnExists(db, 'content_analysis', col.name)) {
      try {
        db.exec(`ALTER TABLE content_analysis ADD COLUMN ${col.name} ${col.type}`);
        results.columnsAdded.push(col.name);
      } catch (err) {
        results.errors.push(`Failed to add column ${col.name}: ${err.message}`);
      }
    }
  }

  // Step 2: Create FTS5 virtual table
  // Check for shadow tables to see if FTS table exists
  if (!tableExists(db, 'articles_fts_content')) {
    try {
      db.exec(`
        CREATE VIRTUAL TABLE articles_fts USING fts5(
          title,
          body_text,
          byline,
          authors,
          content='content_analysis',
          content_rowid='id',
          tokenize='porter unicode61'
        )
      `);
      results.tablesCreated.push('articles_fts');
    } catch (err) {
      // FTS5 might already exist
      if (!err.message.includes('already exists')) {
        results.errors.push(`Failed to create articles_fts: ${err.message}`);
      }
    }
  }

  // Step 3: Create triggers for FTS sync
  const triggers = [
    {
      name: 'articles_fts_insert',
      sql: `
        CREATE TRIGGER articles_fts_insert AFTER INSERT ON content_analysis
        BEGIN
          INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
          VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
        END
      `
    },
    {
      name: 'articles_fts_update',
      sql: `
        CREATE TRIGGER articles_fts_update AFTER UPDATE ON content_analysis
        BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
          VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
          INSERT INTO articles_fts(rowid, title, body_text, byline, authors)
          VALUES (NEW.id, NEW.title, NEW.body_text, NEW.byline, NEW.authors);
        END
      `
    },
    {
      name: 'articles_fts_delete',
      sql: `
        CREATE TRIGGER articles_fts_delete AFTER DELETE ON content_analysis
        BEGIN
          INSERT INTO articles_fts(articles_fts, rowid, title, body_text, byline, authors)
          VALUES ('delete', OLD.id, OLD.title, OLD.body_text, OLD.byline, OLD.authors);
        END
      `
    }
  ];

  for (const trigger of triggers) {
    if (!triggerExists(db, trigger.name)) {
      try {
        db.exec(trigger.sql);
        results.triggersCreated.push(trigger.name);
      } catch (err) {
        results.errors.push(`Failed to create trigger ${trigger.name}: ${err.message}`);
      }
    }
  }

  // Step 4: Create indexes for faceted filtering
  const indexes = [
    { name: 'idx_content_analysis_date', sql: 'CREATE INDEX idx_content_analysis_date ON content_analysis(date)' },
    { name: 'idx_content_analysis_byline', sql: 'CREATE INDEX idx_content_analysis_byline ON content_analysis(byline)' },
    { name: 'idx_content_analysis_analyzed_at', sql: 'CREATE INDEX idx_content_analysis_analyzed_at ON content_analysis(analyzed_at)' }
  ];

  for (const idx of indexes) {
    if (!indexExists(db, idx.name)) {
      try {
        db.exec(idx.sql);
        results.indexesCreated.push(idx.name);
      } catch (err) {
        results.errors.push(`Failed to create index ${idx.name}: ${err.message}`);
      }
    }
  }

  // Record migration
  try {
    db.prepare(`
      INSERT OR REPLACE INTO schema_migrations (version, name, applied_at, description, rollback_sql)
      VALUES (?, ?, datetime('now'), ?, ?)
    `).run(
      MIGRATION_VERSION,
      MIGRATION_NAME,
      'Add FTS5 full-text search for articles with byline/authors columns',
      'DROP TRIGGER IF EXISTS articles_fts_insert; DROP TRIGGER IF EXISTS articles_fts_update; DROP TRIGGER IF EXISTS articles_fts_delete; DROP TABLE IF EXISTS articles_fts;'
    );
  } catch (err) {
    results.errors.push(`Failed to record migration: ${err.message}`);
  }

  return results;
}

/**
 * Roll back the migration
 */
function down(db) {
  const results = {
    triggersDropped: [],
    tablesDropped: [],
    errors: []
  };

  // Drop triggers first
  const triggers = ['articles_fts_insert', 'articles_fts_update', 'articles_fts_delete'];
  for (const trigger of triggers) {
    try {
      db.exec(`DROP TRIGGER IF EXISTS ${trigger}`);
      results.triggersDropped.push(trigger);
    } catch (err) {
      results.errors.push(`Failed to drop trigger ${trigger}: ${err.message}`);
    }
  }

  // Drop FTS table
  try {
    db.exec('DROP TABLE IF EXISTS articles_fts');
    results.tablesDropped.push('articles_fts');
  } catch (err) {
    results.errors.push(`Failed to drop articles_fts: ${err.message}`);
  }

  // Note: We don't drop the columns as SQLite doesn't support DROP COLUMN easily
  // The columns will remain but be unused after rollback

  // Remove migration record
  try {
    db.prepare('DELETE FROM schema_migrations WHERE version = ?').run(MIGRATION_VERSION);
  } catch (err) {
    results.errors.push(`Failed to remove migration record: ${err.message}`);
  }

  return results;
}

/**
 * Check if migration has been applied
 */
function isApplied(db) {
  try {
    const result = db.prepare(`
      SELECT version FROM schema_migrations WHERE version = ?
    `).get(MIGRATION_VERSION);
    return !!result;
  } catch (_) {
    return false;
  }
}

module.exports = {
  MIGRATION_VERSION,
  MIGRATION_NAME,
  up,
  down,
  isApplied
};
