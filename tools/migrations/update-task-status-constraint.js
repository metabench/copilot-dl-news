#!/usr/bin/env node
/**
 * Migration: Update background_tasks status CHECK constraint to include 'abandoned'
 * 
 * SQLite doesn't support altering CHECK constraints, so we need to:
 * 1. Create a new table with the correct constraint
 * 2. Copy all data
 * 3. Drop the old table
 * 4. Rename the new table
 * 
 * Usage:
 *   node tools/migrations/update-task-status-constraint.js
 *   node tools/migrations/update-task-status-constraint.js --db path/to/news.db
 */

const path = require('path');
const Database = require('better-sqlite3');
const { findProjectRoot } = require('../../src/shared/utils/project-root');

function migrate(dbPath) {
  const db = new Database(dbPath);
  
  try {
    // Check current schema
    const schema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='background_tasks'`).get();
    
    if (!schema) {
      console.log('[Migration] background_tasks table does not exist');
      return { success: false, error: 'Table not found' };
    }
    
    // Check if 'abandoned' is already in the constraint
    if (schema.sql.includes("'abandoned'")) {
      console.log('[Migration] Status constraint already includes abandoned');
      return { success: true, alreadyUpdated: true };
    }
    
    console.log('[Migration] Current schema:');
    console.log(schema.sql);
    
    // Start a transaction
    db.exec('BEGIN TRANSACTION');
    
    try {
      // Create new table with updated constraint
      db.exec(`
        CREATE TABLE background_tasks_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          task_type TEXT NOT NULL,
          status TEXT NOT NULL CHECK(status IN ('pending', 'resuming', 'running', 'paused', 'completed', 'failed', 'cancelled', 'abandoned')),
          progress_current INTEGER DEFAULT 0,
          progress_total INTEGER DEFAULT 0,
          progress_message TEXT,
          config TEXT,
          metadata TEXT,
          error_message TEXT,
          created_at TEXT NOT NULL,
          started_at TEXT,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          resume_started_at TEXT,
          cancellation_reason TEXT
        )
      `);
      
      // Copy data
      db.exec(`
        INSERT INTO background_tasks_new 
        SELECT id, task_type, status, progress_current, progress_total, progress_message,
               config, metadata, error_message, created_at, started_at, updated_at,
               completed_at, resume_started_at, cancellation_reason
        FROM background_tasks
      `);
      
      // Drop old table
      db.exec('DROP TABLE background_tasks');
      
      // Rename new table
      db.exec('ALTER TABLE background_tasks_new RENAME TO background_tasks');
      
      // Recreate indexes if any existed
      db.exec('CREATE INDEX IF NOT EXISTS idx_background_tasks_status ON background_tasks(status)');
      db.exec('CREATE INDEX IF NOT EXISTS idx_background_tasks_type ON background_tasks(task_type)');
      
      db.exec('COMMIT');
      
      console.log('[Migration] Successfully updated status constraint to include abandoned');
      
      // Verify
      const newSchema = db.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name='background_tasks'`).get();
      console.log('[Migration] New schema:');
      console.log(newSchema.sql);
      
      return { success: true, updated: true };
      
    } catch (err) {
      db.exec('ROLLBACK');
      throw err;
    }
    
  } finally {
    db.close();
  }
}

// CLI execution
if (require.main === module) {
  const args = process.argv.slice(2);
  let dbPath;
  
  const dbIndex = args.indexOf('--db');
  if (dbIndex !== -1 && args[dbIndex + 1]) {
    dbPath = args[dbIndex + 1];
  } else {
    const projectRoot = findProjectRoot(__dirname);
    dbPath = path.join(projectRoot, 'data', 'news.db');
  }
  
  console.log(`[Migration] Using database: ${dbPath}`);
  
  try {
    const result = migrate(dbPath);
    console.log('[Migration] Result:', result);
    process.exit(result.success ? 0 : 1);
  } catch (error) {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  }
}

module.exports = { migrate };

