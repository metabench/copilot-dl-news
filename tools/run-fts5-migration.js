'use strict';

/**
 * FTS5 Article Search Migration Runner
 * 
 * Run: node tools/run-fts5-migration.js [up|down|status]
 */

const Database = require('better-sqlite3');
const path = require('path');
const { up, down, isApplied, MIGRATION_NAME, MIGRATION_VERSION } = require('../src/db/sqlite/v1/migrations/add_fts5_article_search');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

const action = process.argv[2] || 'status';

console.log(`=== FTS5 Article Search Migration ===`);
console.log(`Migration: ${MIGRATION_NAME} (v${MIGRATION_VERSION})`);
console.log(`Action: ${action}\n`);

let db;
try {
  db = new Database(DB_PATH);
  console.log(`✅ Database opened: ${DB_PATH}`);
} catch (err) {
  console.error(`❌ Failed to open database: ${err.message}`);
  process.exit(1);
}

// Check current status
const applied = isApplied(db);
console.log(`Current status: ${applied ? 'APPLIED' : 'NOT APPLIED'}\n`);

if (action === 'status') {
  db.close();
  process.exit(0);
}

if (action === 'up') {
  if (applied) {
    console.log('Migration already applied. Nothing to do.');
    db.close();
    process.exit(0);
  }

  console.log('Applying migration...\n');
  const result = up(db);

  console.log('Results:');
  if (result.columnsAdded.length > 0) {
    console.log(`  Columns added: ${result.columnsAdded.join(', ')}`);
  }
  if (result.tablesCreated.length > 0) {
    console.log(`  Tables created: ${result.tablesCreated.join(', ')}`);
  }
  if (result.triggersCreated.length > 0) {
    console.log(`  Triggers created: ${result.triggersCreated.join(', ')}`);
  }
  if (result.indexesCreated.length > 0) {
    console.log(`  Indexes created: ${result.indexesCreated.join(', ')}`);
  }
  if (result.errors.length > 0) {
    console.log('  Errors:');
    for (const err of result.errors) {
      console.log(`    ❌ ${err}`);
    }
  }

  if (result.errors.length === 0) {
    console.log('\n✅ Migration applied successfully!');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run schema:sync');
    console.log('  2. Run: node tools/fts-backfill.js --limit 1000');
    console.log('  3. Run: node checks/search-service.check.js');
  } else {
    console.log('\n⚠️  Migration completed with errors');
  }
} else if (action === 'down') {
  if (!applied) {
    console.log('Migration not applied. Nothing to roll back.');
    db.close();
    process.exit(0);
  }

  console.log('Rolling back migration...\n');
  const result = down(db);

  console.log('Results:');
  if (result.triggersDropped.length > 0) {
    console.log(`  Triggers dropped: ${result.triggersDropped.join(', ')}`);
  }
  if (result.tablesDropped.length > 0) {
    console.log(`  Tables dropped: ${result.tablesDropped.join(', ')}`);
  }
  if (result.errors.length > 0) {
    console.log('  Errors:');
    for (const err of result.errors) {
      console.log(`    ❌ ${err}`);
    }
  }

  if (result.errors.length === 0) {
    console.log('\n✅ Rollback completed successfully!');
  } else {
    console.log('\n⚠️  Rollback completed with errors');
  }
} else {
  console.log(`Unknown action: ${action}`);
  console.log('Usage: node tools/run-fts5-migration.js [up|down|status]');
}

db.close();
