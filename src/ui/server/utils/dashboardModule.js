"use strict";

const path = require("path");
const Database = require("better-sqlite3");

/**
 * Resolve a better-sqlite3 db handle from injected providers or by opening a local DB.
 *
 * Contract:
 * - Prefer injection (unified app / shared DB): `getDbRW()` (NewsDatabase) or `getDbHandle()` (better-sqlite3 Database)
 * - Fallback (standalone runner): open local DB at `dbPath`
 *
 * @param {object} [options]
 * @param {string} [options.dbPath] - Path to sqlite DB (defaults to ./data/news.db)
 * @param {boolean} [options.readonly] - Open in readonly mode when opening locally
 * @param {Function} [options.getDbHandle] - Returns a better-sqlite3 Database handle
 * @param {Function} [options.getDbRW] - Returns a NewsDatabase instance (expects `.db` to be a better-sqlite3 handle)
 * @returns {{ dbHandle: any, close: Function, source: 'injected-handle'|'injected-newsdb'|'opened' }}
 */
function resolveBetterSqliteHandle(options = {}) {
  const {
    dbPath,
    readonly = false,
    getDbHandle,
    getDbRW
  } = options;

  const resolvedPath = dbPath || path.join(process.cwd(), "data", "news.db");

  const openLocal = () => {
    const opened = new Database(resolvedPath, { readonly });
    return {
      dbHandle: opened,
      close: () => {
        try {
          opened.close();
        } catch {
          // ignore
        }
      },
      source: "opened"
    };
  };

  if (typeof getDbHandle === "function") {
    const db = getDbHandle();
    if (db && db.open) {
      return { dbHandle: db, close: () => {}, source: "injected-handle" };
    }
    return openLocal();
  }

  if (typeof getDbRW === "function") {
    const newsDb = getDbRW();
    const db = newsDb?.db;
    if (db && db.open) {
      return { dbHandle: db, close: () => {}, source: "injected-newsdb" };
    }
    return openLocal();
  }

  return openLocal();
}

module.exports = {
  resolveBetterSqliteHandle
};
