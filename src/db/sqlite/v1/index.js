"use strict";

const NewsDatabase = require("./SQLiteNewsDatabase");
const { ensureDb } = require("./ensureDb");
const { openDatabase, ensureDatabase } = require("./connection");
const { wrapWithTelemetry } = require("./instrumentation");
const { createInstrumentedDb } = require("./instrumentedDb");
const { initializeSchema, initGazetteerTables } = require("./schema");
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
    return new NewsDatabase(dbHandle);
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

