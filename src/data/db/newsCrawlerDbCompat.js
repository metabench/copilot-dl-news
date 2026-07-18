"use strict";

const path = require("path");
// Retired v1/SQLiteNewsDatabase shim exported ncdb's NewsDatabase with a
// SQLiteNewsDatabase fallback — same resolution preserved here.
const ncdbForNewsDatabase = require("news-crawler-db");
const NewsDatabase = ncdbForNewsDatabase.NewsDatabase || ncdbForNewsDatabase.SQLiteNewsDatabase;
const { ensureDatabase } = require("./sqlite/v1/connection");

function resolveDbPath(options = {}) {
  if (typeof options === "string") return options;
  if (options && typeof options === "object") {
    return options.dbPath || options.dbFilePath || options.path;
  }
  return null;
}

function resolveNewsCrawlerDbModule() {
  const candidates = ["news-crawler-db", "news-crawler-db/dist/db"];
  let lastError = null;
  for (const id of candidates) {
    try {
      return require(id);
    } catch (err) {
      lastError = err;
    }
  }
  const msg = lastError && lastError.message ? lastError.message : String(lastError || "unknown");
  throw new Error(`news-crawler-db module not available: ${msg}`);
}

function createNewsCrawlerDbCompat(options = {}) {
  const dbPath = resolveDbPath(options) || process.env.NEWS_DB_PATH || path.join(process.cwd(), "data", "news.db");

  // Connection ownership lives in news-crawler-db; this repo only keeps the
  // legacy NewsDatabase facade while call sites are migrated method by method.
  const dbHandle = ensureDatabase(dbPath, options);
  const newsDb = new NewsDatabase(dbHandle);
  newsDb.core = dbHandle;
  newsDb.usesNewsCrawlerDb = true;

  return newsDb;
}

module.exports = {
  createNewsCrawlerDbCompat,
  resolveNewsCrawlerDbModule
};
