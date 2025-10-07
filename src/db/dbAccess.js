/**
 * Unified Database Access Utility
 * 
 * Provides a single, clear pattern for accessing the NewsDatabase throughout the application.
 * Eliminates ambiguity about when to use NewsDatabase constructor vs getDbRW vs openDbReadOnly.
 * 
 * USAGE PATTERNS:
 * 
 * 1. CLI Tools / Scripts:
 *    const { withNewsDb } = require('./db/dbAccess');
 *    withNewsDb(dbPath, (db) => {
 *      // Use db here - automatically closed when done
 *    });
 * 
 * 2. Express Routes (with getDbRW injected):
 *    const { createDbMiddleware } = require('./db/dbAccess');
 *    router.use(createDbMiddleware(getDbRW));
 *    router.get('/route', (req, res) => {
 *      const db = req.db; // Already available, handles errors
 *    });
 * 
 * 3. Background Services:
 *    const { openNewsDb } = require('./db/dbAccess');
 *    const db = openNewsDb(dbPath);
 *    // Use db...
 *    db.close(); // Remember to close!
 */

const path = require('path');
const NewsDatabase = require('./sqlite/SQLiteNewsDatabase');

/**
 * Open a NewsDatabase connection
 * 
 * @param {string} [dbPath] - Path to database file (defaults to data/news.db)
 * @returns {NewsDatabase} - Database instance (caller must close!)
 * 
 * @example
 * const db = openNewsDb();
 * try {
 *   const count = db.getCount();
 *   console.log('Articles:', count);
 * } finally {
 *   db.close();
 * }
 */
function openNewsDb(dbPath) {
  const resolvedPath = dbPath || path.join(process.cwd(), 'data', 'news.db');
  return new NewsDatabase(resolvedPath);
}

/**
 * Execute a function with a NewsDatabase connection that auto-closes
 * 
 * @param {string} [dbPath] - Path to database file
 * @param {Function} fn - Function to execute with db connection
 * @returns {Promise<any>} - Result of fn
 * 
 * @example
 * const articles = await withNewsDb(null, (db) => {
 *   return db.db.prepare('SELECT * FROM articles LIMIT 10').all();
 * });
 */
async function withNewsDb(dbPath, fn) {
  const db = openNewsDb(dbPath);
  try {
    const result = await fn(db);
    return result;
  } finally {
    try {
      db.close();
    } catch (err) {
      // Ignore close errors
    }
  }
}

/**
 * Create Express middleware that adds db to req object
 * 
 * @param {Function} getDbRW - Database accessor function
 * @returns {Function} - Express middleware
 * 
 * @example
 * // In route setup:
 * router.use(createDbMiddleware(getDbRW));
 * 
 * // In route handler:
 * router.get('/api/endpoint', (req, res) => {
 *   if (!req.db) {
 *     return res.status(503).json({ error: 'Database not available' });
 *   }
 *   const data = req.db.getSomeData();
 *   res.json(data);
 * });
 */
function createDbMiddleware(getDbRW) {
  return (req, res, next) => {
    try {
      req.db = getDbRW();
      next();
    } catch (error) {
      req.db = null;
      next();
    }
  };
}

/**
 * Helper for Express routes: get db and handle errors
 * 
 * @param {Function} getDbRW - Database accessor function
 * @param {Object} res - Express response object
 * @returns {NewsDatabase|null} - Database instance or null (error sent to client)
 * 
 * @example
 * router.get('/api/endpoint', (req, res) => {
 *   const db = getDbOrError(getDbRW, res);
 *   if (!db) return; // Error already sent
 *   
 *   const data = db.getSomeData();
 *   res.json(data);
 * });
 */
function getDbOrError(getDbRW, res) {
  try {
    const db = getDbRW();
    if (!db) {
      res.status(503).json({ error: 'Database not available' });
      return null;
    }
    return db;
  } catch (error) {
    res.status(503).json({ error: 'Database connection failed' });
    return null;
  }
}

/**
 * Check if database is available (non-throwing)
 * 
 * @param {Function} getDbRW - Database accessor function
 * @returns {boolean} - True if database is available
 */
function isDbAvailable(getDbRW) {
  try {
    const db = getDbRW();
    return db !== null && db !== undefined;
  } catch {
    return false;
  }
}

module.exports = {
  openNewsDb,
  withNewsDb,
  createDbMiddleware,
  getDbOrError,
  isDbAvailable
};
