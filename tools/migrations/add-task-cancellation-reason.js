#!/usr/bin/env node
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * Migration: Add cancellation_reason column to background_tasks table
 * 
 * This enables tracking why tasks were cancelled or abandoned,
 * which is essential for understanding system history and avoiding
 * re-running obsolete tasks.
 * 
 * Usage:
 *   node tools/migrations/add-task-cancellation-reason.js
 *   node tools/migrations/add-task-cancellation-reason.js --db path/to/news.db
 */

const path = require('path');
const { findProjectRoot } = require('../../src/shared/utils/project-root');

async function migrate(dbPath) {
  const db = openNewsCrawlerDb(dbPath);
  
  try {
    const result = db.migrationUtilities.ensureBackgroundTaskCancellationReason();

    if (result.alreadyExists) {
      console.log('[Migration] cancellation_reason column already exists');
      return { success: true, alreadyExists: true };
    }

    console.log('[Migration] Added cancellation_reason column to background_tasks');

    console.log('[Migration] Current status column:', result.statusColumn);
    
    // The CHECK constraint will be enforced by the schema-definitions.js
    // on new tables; existing tables will accept 'abandoned' status
    // because SQLite CHECK constraints on existing columns are lenient
    
    return { success: true, added: true };
    
  } finally {
    await db.close();
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
  
  migrate(dbPath).then((result) => {
    console.log('[Migration] Result:', result);
    process.exit(0);
  }).catch((error) => {
    console.error('[Migration] Failed:', error.message);
    process.exit(1);
  });
}

module.exports = { migrate };
