"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.domainListing");

/**
 * Query helpers for domain listing with search, sort, and pagination.
 *
 * Provides efficient domain enumeration from the urls table, with optional
 * search filtering, configurable sort order, and limit/offset pagination.
 */

/**
 * Valid sort columns and their SQL mappings
 */
const SORT_COLUMNS = {
  host: "host",
  url_count: "url_count",
  last_seen: "last_seen"
};

/**
 * Normalize sort column to a safe value
 * @param {string} col
 * @returns {string}
 */
function normalizeSortColumn(col) {
  if (!col || typeof col !== "string") return "url_count";
  const lower = col.toLowerCase().trim();
  return SORT_COLUMNS[lower] ? lower : "url_count";
}

/**
 * Normalize sort direction
 * @param {string} dir
 * @returns {"ASC" | "DESC"}
 */
function normalizeSortDirection(dir) {
  if (!dir || typeof dir !== "string") return "DESC";
  const upper = dir.toUpperCase().trim();
  return upper === "ASC" ? "ASC" : "DESC";
}

/**
 * Build WHERE clause for search filtering
 * @param {string} [search]
 * @returns {{ clause: string, params: string[] }}
 */
function buildSearchClause(search) {
  if (!search || typeof search !== "string" || !search.trim()) {
    return { clause: "", params: [] };
  }
  const trimmed = search.trim();
  // Escape LIKE special characters
  const escaped = trimmed.replace(/([%_\\])/g, "\\$1");
  return {
    clause: "WHERE host LIKE ? ESCAPE '\\'",
    params: [`%${escaped}%`]
  };
}

/**
 * Build the complete domain listing SQL
 * @param {{ search?: string, sortBy?: string, sortDir?: string }} options
 * @returns {{ sql: string, countSql: string }}
 */
function buildDomainListingSql(options = {}) {
  const { search } = options;
  const sortBy = normalizeSortColumn(options.sortBy);
  const sortDir = normalizeSortDirection(options.sortDir);

  const { clause: whereClause } = buildSearchClause(search);
  const orderColumn = SORT_COLUMNS[sortBy];
  const secondarySort = sortBy === "host" ? "" : ", host ASC";

  const baseSql = `
    SELECT
      host,
      COUNT(*) AS url_count,
      MAX(last_seen_at) AS last_seen
    FROM urls
    ${whereClause ? whereClause : "WHERE host IS NOT NULL AND TRIM(host) <> ''"}
    ${whereClause ? "AND host IS NOT NULL AND TRIM(host) <> ''" : ""}
    GROUP BY LOWER(host)
    ORDER BY ${orderColumn} ${sortDir}${secondarySort}
    LIMIT ? OFFSET ?
  `;

  const countSql = `
    SELECT COUNT(DISTINCT LOWER(host)) AS total
    FROM urls
    ${whereClause ? whereClause : "WHERE host IS NOT NULL AND TRIM(host) <> ''"}
    ${whereClause ? "AND host IS NOT NULL AND TRIM(host) <> ''" : ""}
  `;

  return { sql: baseSql.trim(), countSql: countSql.trim() };
}

/**
 * Select paginated domain listing
 * @param {import("better-sqlite3").Database} db
 * @param {{ search?: string, sortBy?: string, sortDir?: string, limit?: number, offset?: number }} options
 * @returns {Array<{ host: string, url_count: number, last_seen: string | null }>}
 */
function selectDomainPage(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectDomainPage requires a database handle");
  }
  const limit = Number.isFinite(options.limit) && options.limit > 0 ? Math.trunc(options.limit) : 25;
  const offset = Number.isFinite(options.offset) && options.offset >= 0 ? Math.trunc(options.offset) : 0;

  const { search } = options;
  const { clause: whereClause, params: whereParams } = buildSearchClause(search);
  const sortBy = normalizeSortColumn(options.sortBy);
  const sortDir = normalizeSortDirection(options.sortDir);
  const orderColumn = SORT_COLUMNS[sortBy];
  const secondarySort = sortBy === "host" ? "" : ", host ASC";

  const whereBase = whereClause
    ? `${whereClause} AND host IS NOT NULL AND TRIM(host) <> ''`
    : "WHERE host IS NOT NULL AND TRIM(host) <> ''";

  const sql = `
    SELECT
      host,
      COUNT(*) AS url_count,
      MAX(last_seen_at) AS last_seen
    FROM urls
    ${whereBase}
    GROUP BY LOWER(host)
    ORDER BY ${orderColumn} ${sortDir}${secondarySort}
    LIMIT ? OFFSET ?
  `;

  const stmt = db.prepare(sql);
  return stmt.all(...whereParams, limit, offset);
}

/**
 * Count total domains (for pagination)
 * @param {import("better-sqlite3").Database} db
 * @param {{ search?: string }} options
 * @returns {number}
 */
function countDomains(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countDomains requires a database handle");
  }
  const { search } = options;
  const { clause: whereClause, params: whereParams } = buildSearchClause(search);

  const whereBase = whereClause
    ? `${whereClause} AND host IS NOT NULL AND TRIM(host) <> ''`
    : "WHERE host IS NOT NULL AND TRIM(host) <> ''";

  const sql = `SELECT COUNT(DISTINCT LOWER(host)) AS total FROM urls ${whereBase}`;
  const stmt = db.prepare(sql);
  const row = stmt.get(...whereParams);
  return row && typeof row.total === "number" ? row.total : 0;
}

module.exports = {
  selectDomainPage,
  countDomains,
  normalizeSortColumn,
  normalizeSortDirection
};
