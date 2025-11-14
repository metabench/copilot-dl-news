"use strict";

const statementCache = new WeakMap();
const columnCache = new WeakMap();
const IDENTIFIER_PATTERN = /^[A-Za-z_][A-Za-z0-9_]*$/;

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

function normalizeIdentifier(name) {
  const text = String(name ?? "").trim();
  if (!text || !IDENTIFIER_PATTERN.test(text)) {
    return null;
  }
  return text;
}

function tableHasColumn(db, tableName, columnName) {
  if (!db || typeof db.prepare !== "function") return false;
  const table = normalizeIdentifier(tableName);
  const column = normalizeIdentifier(columnName);
  if (!table || !column) return false;
  let dbColumns = columnCache.get(db);
  if (!dbColumns) {
    dbColumns = new Map();
    columnCache.set(db, dbColumns);
  }
  let tableColumns = dbColumns.get(table);
  if (!tableColumns) {
    const rows = db.prepare(`PRAGMA table_info(${table})`).all();
    tableColumns = new Set(rows.map((row) => String(row && row.name ? row.name : "").toLowerCase()));
    dbColumns.set(table, tableColumns);
  }
  return tableColumns.has(column.toLowerCase());
}

module.exports = {
  getCachedStatements,
  sanitizeLimit,
  tableHasColumn
};
