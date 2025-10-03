"use strict";

const statementCache = new WeakMap();

function getCachedStatements(db, key, factory) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("getCachedStatements requires a better-sqlite3 database handle");
  }
  let dbCache = statementCache.get(db);
  if (!dbCache) {
    dbCache = new Map();
    statementCache.set(db, dbCache);
  }
  if (dbCache.has(key)) {
    return dbCache.get(key);
  }
  const statements = factory(db);
  dbCache.set(key, statements);
  return statements;
}

function sanitizeLimit(value, { min = 1, max = 500, fallback = 100 } = {}) {
  const num = parseInt(String(value ?? ""), 10);
  if (Number.isFinite(num)) {
    return Math.max(min, Math.min(max, num));
  }
  return fallback;
}

module.exports = {
  getCachedStatements,
  sanitizeLimit
};
