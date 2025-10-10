const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');
const { findProjectRoot } = require('../../utils/project-root');
const { initializeSchema } = require('./schema');

// Open (and create if needed) a SQLite DB file and ensure all schemas exist.
function ensureDb(dbFilePath) {
  const projectRoot = findProjectRoot(__dirname);
  const filePath = dbFilePath || path.join(projectRoot, 'data', 'news.db');
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  const db = new Database(filePath);
  // Sensible pragmas for tools
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  try { db.pragma('busy_timeout = 5000'); } catch (_) {}
  try { db.pragma('synchronous = NORMAL'); } catch (_) {}

  // Centralized schema creation
  try {
    initializeSchema(db);
    
    // Seed initial data
    const NewsDatabase = require('./SQLiteNewsDatabase');
    const newsDbInstance = new NewsDatabase(db);
    newsDbInstance.ensureCrawlTypesSeeded();
  } catch (err) {
    // Log the error for debugging but still return the db handle
    if (process.env.JEST_WORKER_ID || process.env.NODE_ENV !== 'test') {
      process.stderr.write(`[ensureDb] Error during initialization: ${err?.message || err}\n`);
    }
    // Continue - return db handle even if some initialization failed
  }

  return db;
}

module.exports = {
  ensureDb
};
