#!/usr/bin/env node

'use strict';

/**
 * Compatibility alias for the native sqlite3 table-size mode.
 *
 * The table-size SQL now lives in news-crawler-db. This wrapper keeps the old
 * command name while delegating execution and output to db-table-sizes.
 */

const { main } = require('./db-table-sizes');

function analyzeWithSqlite3(argv = process.argv) {
  const args = Array.isArray(argv) ? argv.slice(2) : process.argv.slice(2);
  return main([process.execPath, __filename, '--mode', 'cli', ...args]);
}

if (require.main === module) {
  analyzeWithSqlite3();
}

module.exports = { analyzeWithSqlite3 };
