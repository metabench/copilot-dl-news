#!/usr/bin/env node

const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * clear-telemetry.js - Clear query telemetry data and reclaim disk space
 *
 * Usage:
 *   node tools/clear-telemetry.js    # Clear telemetry and compact database
 */

function printHelp() {
  console.log(`
Query Telemetry Cleaner

Clear query telemetry data and reclaim disk space.

DESCRIPTION:
  This tool deletes all records from the query_telemetry table and runs
  database compaction to reclaim unused disk space. Useful for cleaning up after
  performance analysis or debugging sessions.

USAGE:
  node tools/clear-telemetry.js [options]

OPTIONS:
  --help, -h    Show this help message

ENVIRONMENT:
  DB_PATH       Path to SQLite database (default: data/news.db)

OUTPUT:
  - Number of rows deleted
  - Execution time for cleanup and compaction operations

EXAMPLES:
  node tools/clear-telemetry.js    # Clear telemetry from default database
`);
}

const path = require('path');
const {
  clearQueryTelemetry,
  vacuumDatabase
} = require('news-crawler-db');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'news.db');

function runClearTelemetry() {
  if (process.argv.includes('--help') || process.argv.includes('-h')) {
    printHelp();
    return;
  }

  let db;
  try {
    console.log(`Opening database: ${dbPath}`);
    db = openNewsCrawlerDb(dbPath, { timeout: 15000 });

    console.log('Clearing query telemetry rows...');
    const start = Date.now();
    const info = clearQueryTelemetry(db);
    const duration = Date.now() - start;

    console.log(`\n✓ Success!`);
    console.log(`  - Rows affected: ${info.changes}`);
    console.log(`  - Duration: ${duration}ms`);

    console.log('\nRunning database compaction to reclaim disk space...');
    const compactStart = Date.now();
    vacuumDatabase(db);
    const compactDuration = Date.now() - compactStart;
    console.log(`✓ Compaction complete in ${compactDuration}ms.`);
  } catch (err) {
    console.error(`\n❌ Failed to clear table: ${err.message}`);
    process.exit(1);
  } finally {
    if (db) {
      db.close();
      console.log('\nDatabase connection closed.');
    }
  }
}

if (require.main === module) {
  runClearTelemetry();
}

module.exports = {
  printHelp,
  runClearTelemetry
};
