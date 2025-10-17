const path = require('path');
const { ensureDatabase } = require('../src/db/sqlite');

/**
 * This script performs database maintenance tasks to optimize and clean up the SQLite database.
 * It's particularly useful for managing the WAL (Write-Ahead Log) and SHM (Shared Memory) files,
 * which can grow large if connections are not closed properly.
 *
 * Operations:
 * 1. WAL Checkpoint (TRUNCATE): Forces the content of the WAL file to be written back into the
 *    main database file and truncates the WAL file to zero bytes. This will only succeed if
 *    there are no other active connections.
 * 2. VACUUM: Rebuilds the entire database file, reclaiming free space and defragmenting table
 *    and index data. This reduces the main database file size.
 *
 * Usage:
 *   node tools/db-maintenance.js
 */
function getDbPath() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'news.db');
  console.log(`Using database at: ${dbPath}`);
  return dbPath;
}

function runMaintenance() {
  const dbPath = getDbPath();
  let db;

  try {
    db = ensureDatabase(dbPath);
    console.log('Successfully opened database connection.');

    // 1. Force a WAL Checkpoint to truncate the WAL file
    console.log('Attempting to run WAL checkpoint (TRUNCATE)...');
    try {
      const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)');
      const [status, logSize, checkpointed] = checkpointResult;
      if (status === 0) {
        console.log(`  ✅ Success: WAL checkpoint completed. WAL pages: ${logSize}, Checkpointed pages: ${checkpointed}.`);
        console.log('  WAL file should now be truncated.');
      } else {
        console.warn(`  ⚠️ Warning: WAL checkpoint returned status ${status}. This usually means another connection is still open.`);
        console.warn(`  WAL pages remaining: ${logSize}, Checkpointed pages: ${checkpointed}.`);
      }
    } catch (err) {
      console.error(`  ❌ Error during WAL checkpoint: ${err.message}`);
      console.error('  This almost certainly means there are active connections to the database. Please close all other instances of the application or tests.');
    }

    // 2. Run VACUUM to reclaim space and defragment the main database file
    console.log('\nAttempting to run VACUUM...');
    try {
      db.exec('VACUUM');
      console.log('  ✅ Success: VACUUM command completed.');
    } catch (err) {
      console.error(`  ❌ Error during VACUUM: ${err.message}`);
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
