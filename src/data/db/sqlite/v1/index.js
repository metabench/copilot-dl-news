"use strict";

// Retired ./SQLiteNewsDatabase shim exported ncdb's NewsDatabase with a
// SQLiteNewsDatabase fallback — same resolution preserved here.
const ncdbForNewsDatabase = require("news-crawler-db");
const NewsDatabase = ncdbForNewsDatabase.NewsDatabase || ncdbForNewsDatabase.SQLiteNewsDatabase;
const { ensureDb } = require("./ensureDb");
const { openDatabase, ensureDatabase } = require("./connection");
const { wrapWithTelemetry } = require("./instrumentation");
const { createInstrumentedDb } = require("./instrumentedDb");
// Historical short names; ncdb sources carry the SqliteV1 infix.
const {
  initializeSqliteV1Schema: initializeSchema,
  initSqliteV1GazetteerTables: initGazetteerTables
} = require("news-crawler-db");
const { dedupePlaceSources } = require("./tools/dedupePlaceSources");

function normalizeSQLiteOptions(options = {}) {
  if (typeof options === "string") {
    return { dbPath: options };
  }
  if (options && typeof options === "object") {
    return { ...options };
  }
  return {};
}

function resolveDbPath(options = {}) {
  if (typeof options === "string") return options;
  if (!options || typeof options !== "object") return undefined;
  return options.dbPath || options.dbFilePath;
}

function createSQLiteDatabase(inputOptions = {}) {
  const normalized = normalizeSQLiteOptions(inputOptions);
  const dbPath = resolveDbPath(normalized);
  if (dbPath) {
    // Use ensureDb to open the database and create/verify schema
    const dbHandle = ensureDb(dbPath);
    const newsDb = new NewsDatabase(dbHandle);
    newsDb.core = dbHandle;
    newsDb.usesNewsCrawlerDb = true;
    return newsDb;
  }
  throw new Error('createSQLiteDatabase requires a dbPath');
}

/**
 * Open database in read-only mode (helper for backward compatibility)
 * @param {string} dbPath - Path to database file
 * @returns {Database} Read-only database instance
 */
function openDbReadOnly(dbPath) {
  return openDatabase(dbPath, { readonly: true, fileMustExist: true });
}

module.exports = {
  NewsDatabase,
  SQLiteNewsDatabase: NewsDatabase,
  createSQLiteDatabase,
  normalizeSQLiteOptions,
  resolveDbPath,
  // Legacy API (backward compatibility)
  ensureDb,
  ensureGazetteer: (db) => initGazetteerTables(db, { verbose: false, logger: console }),
  createInstrumentedDb,
  openDbReadOnly,
  // New simplified API
  openDatabase,
  ensureDatabase,
  wrapWithTelemetry,
  initializeSchema,
  initGazetteerTables,
  // Maintenance tools
  dedupePlaceSources
};

