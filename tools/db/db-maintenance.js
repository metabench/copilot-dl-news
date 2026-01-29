const path = require('path');
const { ensureDatabase } = require('../src/data/db/sqlite');

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
 *   node tools/db-maintenance.js --checkpoint-only
 *
 * Options:
 *   --checkpoint-only   Run WAL checkpoint but skip VACUUM (safer/faster for large DBs)
 *   --no-vacuum         Alias for --checkpoint-only
 */
function getDbPath() {
  const dbPath = process.env.DB_PATH || path.join(__dirname, '..', 'data', 'news.db');
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
    db = ensureDatabase(dbPath);
    console.log('Successfully opened database connection.');

    // 1. Force a WAL Checkpoint to truncate the WAL file
    console.log('Attempting to run WAL checkpoint (TRUNCATE)...');
    try {
      const checkpointResult = db.pragma('wal_checkpoint(TRUNCATE)');

      // better-sqlite3 has returned multiple shapes across versions:
      // - [busy, log, checkpointed]
      // - [{ busy, log, checkpointed }]
      // - { busy, log, checkpointed }
      let status;
      let logSize;
      let checkpointed;

      if (Array.isArray(checkpointResult)) {
        if (checkpointResult.length === 3 && checkpointResult.every((v) => typeof v === 'number')) {
          [status, logSize, checkpointed] = checkpointResult;
        } else if (checkpointResult.length > 0 && checkpointResult[0] && typeof checkpointResult[0] === 'object') {
          const row = checkpointResult[0];
          status = row.busy ?? row.status;
          logSize = row.log ?? row.logSize;
          checkpointed = row.checkpointed;
        }
      } else if (checkpointResult && typeof checkpointResult === 'object') {
        status = checkpointResult.busy ?? checkpointResult.status;
        logSize = checkpointResult.log ?? checkpointResult.logSize;
        checkpointed = checkpointResult.checkpointed;
      }

      // Coerce any missing values so output stays readable.
      if (typeof status !== 'number') status = Number.isFinite(status) ? status : 0;
      if (typeof logSize !== 'number') logSize = Number.isFinite(logSize) ? logSize : 0;
      if (typeof checkpointed !== 'number') checkpointed = Number.isFinite(checkpointed) ? checkpointed : 0;

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
    if (options.skipVacuum) {
      console.log('\nSkipping VACUUM (--checkpoint-only).');
    } else {
      console.log('\nAttempting to run VACUUM...');
      try {
        db.exec('VACUUM');
        console.log('  ✅ Success: VACUUM command completed.');
      } catch (err) {
        console.error(`  ❌ Error during VACUUM: ${err.message}`);
      }
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
