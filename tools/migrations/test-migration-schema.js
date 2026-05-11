#!/usr/bin/env node

/**
 * Test Migration Schema Application
 *
 * Exercises the URL-normalization migration schema against a temporary
 * database. SQL and schema ownership live in news-crawler-db.
 */

const fs = require('fs');
const path = require('path');
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

function closeDb(db) {
  if (db && typeof db.close === 'function') {
    db.close();
  }
}

function testMigrationSchema() {
  const testDbPath = path.resolve(__dirname, '../../test-migration.db');
  if (fs.existsSync(testDbPath)) fs.unlinkSync(testDbPath);

  console.log('Testing migration schema application...');

  let db;
  try {
    const runSmoke = getDbApi('runUrlNormalizationMigrationSchemaSmoke');
    db = openNewsCrawlerDb(testDbPath);
    const report = runSmoke(db);

    console.log('Minimal base schema created');
    console.log('Migration schema applied');

    for (const table of report.tables) {
      console.log(`${table.name}: ${table.columnCount} columns`);
      for (const expectedColumn of table.expectedColumns) {
        console.log(`  ${expectedColumn} column exists`);
      }
    }

    console.log('Foreign key constraints validated');
    console.log('Migration schema test completed successfully.');
    console.log('');
    console.log('Next steps:');
    console.log('1. Run migration on development database');
    console.log('2. Validate migration results');
    console.log('3. Update application code to use url_id fields');
  } catch (error) {
    console.error('Migration schema test failed:', error.message);
    process.exitCode = 1;
  } finally {
    closeDb(db);
    if (fs.existsSync(testDbPath)) {
      fs.unlinkSync(testDbPath);
    }
  }
}

if (require.main === module) {
  testMigrationSchema();
}

module.exports = { testMigrationSchema };
