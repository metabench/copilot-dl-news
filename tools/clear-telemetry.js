#!/usr/bin/env node

/**
 * clear-telemetry.js - Clear query telemetry data and reclaim disk space
 *
 * Usage:
 *   node tools/clear-telemetry.js    # Clear telemetry and vacuum database
 */

// Check for help
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Query Telemetry Cleaner

Clear query telemetry data and reclaim disk space.

DESCRIPTION:
  This tool deletes all records from the query_telemetry table and runs
  VACUUM to reclaim unused disk space. Useful for cleaning up after
  performance analysis or debugging sessions.

USAGE:
  node tools/clear-telemetry.js [options]

OPTIONS:
  --help, -h    Show this help message

ENVIRONMENT:
  DB_PATH       Path to SQLite database (default: data/news.db)

OUTPUT:
  - Number of rows deleted
  - Execution time for delete and vacuum operations

EXAMPLES:
  node tools/clear-telemetry.js    # Clear telemetry from default database
`);
  process.exit(0);
}

const path = require('path');
const Database = require('better-sqlite3');
const { clearQueryTelemetry } = require('../src/db/sqlite/v1/queries/telemetry');

const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'news.db');
let db;

try {
  console.log(`Opening database: ${dbPath}`);
  db = new Database(dbPath, { timeout: 15000 });
  
  console.log('Executing DELETE FROM query_telemetry...');
  const start = Date.now();
  const info = clearQueryTelemetry(db);
  const duration = Date.now() - start;
  
  console.log(`\n✓ Success!`);
  console.log(`  - Rows affected: ${info.changes}`);
  console.log(`  - Duration: ${duration}ms`);
  
  console.log('\nRunning VACUUM to reclaim disk space...');
  const vacuumStart = Date.now();
  db.prepare('VACUUM').run();
  const vacuumDuration = Date.now() - vacuumStart;
  console.log(`✓ VACUUM complete in ${vacuumDuration}ms.`);

} catch (err) {
  console.error(`\n❌ Failed to clear table: ${err.message}`);
  process.exit(1);
} finally {
  if (db) {
    db.close();
    console.log('\nDatabase connection closed.');
  }
}
