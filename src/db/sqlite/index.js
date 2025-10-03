"use strict";

const NewsDatabase = require("./SQLiteNewsDatabase");
const ensureExports = require("./ensureDb");

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
    return new NewsDatabase(dbPath);
  }
  return new NewsDatabase();
}

module.exports = {
  NewsDatabase,
  SQLiteNewsDatabase: NewsDatabase,
  createSQLiteDatabase,
  normalizeSQLiteOptions,
  resolveDbPath,
  ...ensureExports
};
