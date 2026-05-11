const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { runSqliteMaintenance } = require('news-crawler-db');

/**
 * This script performs database maintenance tasks to optimize and clean up the SQLite database.
 * It's particularly useful for managing the WAL (Write-Ahead Log) and SHM (Shared Memory) files,
 * which can grow large if connections are not closed properly.
 *
 * Operations:
 * 1. WAL checkpoint: Forces the content of the WAL file to be written back into the
 *    main database file and truncates the WAL file to zero bytes. This will only succeed if
 *    there are no other active connections.
 * 2. Database compaction: Rebuilds the database file, reclaiming free space and defragmenting table
 *    and index data. This reduces the main database file size.
 *
 * Usage:
 *   node tools/db-maintenance.js
 *   node tools/db-maintenance.js --checkpoint-only
 *
 * Options:
 *   --checkpoint-only   Run WAL checkpoint but skip database compaction (safer/faster for large DBs)
 *   --no-vacuum         Alias for --checkpoint-only
 */
function getDbPath() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', '..', 'data', 'news.db');
  console.log(`Using database at: ${dbPath}`);
  return dbPath;
}

function parseOptions(argv = process.argv) {
  const args = new Set(argv.slice(2));
  const skipVacuum = args.has('--checkpoint-only') || args.has('--no-vacuum');
  return {
    skipVacuum
  };
}

function runMaintenance(argv = process.argv) {
  const options = parseOptions(argv);
  const dbPath = getDbPath();
  let db;

  try {
    db = openNewsCrawlerDb(dbPath, { timeout: 15000, fileMustExist: true });
    console.log('Successfully opened database connection.');

    const result = runSqliteMaintenance(db, options);
    const checkpoint = result.checkpoint;

    if (checkpoint.ok) {
      console.log(`  ✅ Success: WAL checkpoint completed. WAL pages: ${checkpoint.logSize}, Checkpointed pages: ${checkpoint.checkpointed}.`);
      console.log('  WAL file should now be truncated.');
    } else {
      console.warn(`  ⚠️ Warning: WAL checkpoint returned status ${checkpoint.status}. This usually means another connection is still open.`);
      console.warn(`  WAL pages remaining: ${checkpoint.logSize}, Checkpointed pages: ${checkpoint.checkpointed}.`);
    }

    if (result.skippedVacuum) {
      console.log('\nSkipping database compaction (--checkpoint-only).');
    } else {
      console.log('\nDatabase compaction completed.');
    }

  } catch (err) {
    console.error(`❌ Failed to open database at ${dbPath}: ${err.message}`);
    console.error('Please ensure the path is correct and the application has permissions to access it.');
  } finally {
    if (db) {
      db.close();
      console.log('\nDatabase connection closed.');
    }
  }
}

if (require.main === module) {
  runMaintenance();
}

module.exports = { runMaintenance };
