/**
 * Test Helpers for Database Access
 * 
 * CRITICAL: SQLite WAL Mode and Test Isolation
 * 
 * This module provides helpers for proper database access in tests.
 * 
 * WHY THIS MATTERS:
 * - SQLite in WAL (Write-Ahead Log) mode isolates writes between connections
 * - Creating multiple connections causes test data to be invisible
 * - Tests MUST use the app's shared connection, never create separate ones
 * 
 * WRONG PATTERN (causes WAL isolation):
 * ```javascript
 * const db = new Database(dbPath);  // Connection 1
 * db.exec('INSERT INTO articles ...');
 * db.close();
 * 
 * const app = createApp({ dbPath });  // Connection 2 - won't see inserts!
 * ```
 * 
 * RIGHT PATTERN (single shared connection):
 * ```javascript
 * const app = createApp({ dbPath, verbose: false });
 * const db = getDbFromApp(app);  // Use THIS helper
 * db.exec('INSERT INTO articles ...');  // Same connection sees all writes
 * ```
 */

'use strict';

/**
 * Get database connection from Express app instance
 * 
 * This is the ONLY way tests should access the database.
 * Never create a separate Database instance.
 * 
 * @param {Express.Application} app - Express app created by createApp()
 * @returns {Database|null} better-sqlite3 Database instance or null
 */
function getDbFromApp(app) {
  if (!app || !app.locals) {
    console.warn('[test-db] getDbFromApp: app or app.locals is null');
    return null;
  }
  
  // Try multiple locations where DB might be stored
  return (
    app.locals.backgroundTaskManager?.db ||  // BackgroundTaskManager stores db
    app.locals.getDb?.() ||                  // Some apps expose getDb function
    app.locals.db ||                          // Direct storage (rare)
    null
  );
}

/**
 * Seed articles table with test data
 * 
 * @param {Database} db - Database instance from getDbFromApp()
 * @param {number} count - Number of articles to create
 * @param {Object} options - Seeding options
 * @param {string} [options.host='example.com'] - Domain for articles
 * @returns {Array<Object>} Created article objects
 */
function seedArticles(db, count = 10, options = {}) {
  const { host = 'example.com' } = options;
  const articles = [];
  
  const stmt = db.prepare(`
    INSERT INTO articles (url, title, date, host, crawled_at)
    VALUES (?, ?, ?, ?, datetime('now'))
  `);
  
  for (let i = 1; i <= count; i++) {
    const url = `https://${host}/article-${i}`;
    const title = `Test Article ${i}`;
    const date = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    
    stmt.run(url, title, date, host);
    articles.push({ url, title, date, host });
  }
  
  return articles;
}

/**
 * Clean up temp database files (including WAL files)
 * 
 * Call this in afterEach() to clean up test databases.
 * 
 * @param {string} dbPath - Path to database file
 */
function cleanupTempDb(dbPath) {
  const suffixes = ['', '-shm', '-wal'];
  for (const suffix of suffixes) {
    try {
      const fs = require('fs');
      fs.unlinkSync(dbPath + suffix);
    } catch (_) {
      // Ignore errors (file might not exist)
    }
  }
}

/**
 * Create temporary database path
 * 
 * @param {string} testName - Name of test (used in filename)
 * @returns {string} Absolute path to temp database
 */
function createTempDbPath(testName = 'test') {
  const path = require('path');
  const os = require('os');
  const fs = require('fs');
  
  const tmpDir = path.join(os.tmpdir(), 'copilot-ui-tests');
  try {
    fs.mkdirSync(tmpDir, { recursive: true });
  } catch (_) {}
  
  const unique = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  return path.join(tmpDir, `${testName}-${unique}.db`);
}

module.exports = {
  getDbFromApp,
  seedArticles,
  cleanupTempDb,
  createTempDbPath
};
