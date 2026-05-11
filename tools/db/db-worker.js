const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { parentPort, workerData } = require('worker_threads');
const { listSqliteDbstatTableSizes } = require('news-crawler-db');
/**
 * This script runs in a separate worker thread to execute a slow,
 * blocking database query without freezing the main application's event loop.
 */

function getTableSizesFromDbstat(dbPath) {
  let db;
  try {
    // The worker gets the dbPath and opens its own connection.
    db = openNewsCrawlerDb(dbPath, { readonly: true });
    return listSqliteDbstatTableSizes(db);
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
