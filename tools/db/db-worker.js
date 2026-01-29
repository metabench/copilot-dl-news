const { parentPort, workerData } = require('worker_threads');
const Database = require('better-sqlite3');

/**
 * This script runs in a separate worker thread to execute a slow,
 * blocking database query without freezing the main application's event loop.
 */

function getTableSizesFromDbstat(dbPath) {
  let db;
  try {
    // The worker gets the dbPath and opens its own connection.
    db = new Database(dbPath, { readonly: true });

    const query = `
      SELECT 
        name,
        COUNT(*) as page_count,
        SUM(pgsize) as size_bytes
      FROM dbstat
      WHERE name NOT LIKE 'sqlite_%'
      GROUP BY name
      ORDER BY size_bytes DESC
    `;
    
    // This is a long-running, synchronous call.
    // It will block this worker thread, but not the main thread.
    const tableStats = db.prepare(query).all();
    
    return tableStats;
  } finally {
    if (db) {
      db.close();
    }
  }
}

try {
  const { dbPath } = workerData;
  const results = getTableSizesFromDbstat(dbPath);
  // Post the results back to the main thread.
  parentPort.postMessage({ success: true, payload: results });
} catch (error) {
  // Post any errors back to the main thread.
  parentPort.postMessage({ success: false, payload: { message: error.message, stack: error.stack } });
}
