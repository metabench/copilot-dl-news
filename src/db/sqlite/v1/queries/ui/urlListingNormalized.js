"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

// Normalized URL listing for UI views (uses urls + latest_fetch when available).

const CACHE_KEY = Symbol.for("db.sqlite.ui.urlListingNormalized");

function sanitizeOffset(value, { min = 0, fallback = 0 } = {}) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  if (numeric < min) return min;
  return Math.max(min, Math.trunc(numeric));
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => {
    try {
      return {
        selectPage: handle.prepare(`
          SELECT
            u.id,
            u.url,
            u.host,
            u.canonical_url AS canonicalUrl,
            u.created_at AS createdAt,
            u.last_seen_at AS lastSeenAt,
            lf.ts AS lastFetchAt,
            lf.http_status AS httpStatus,
            lf.classification AS classification,
            lf.word_count AS wordCount
          FROM urls u
          LEFT JOIN latest_fetch lf ON lf.url = u.url
          ORDER BY u.id ASC
          LIMIT ? OFFSET ?
        `),
        countAll: handle.prepare(`SELECT COUNT(1) AS total FROM urls`),
        hasLatestFetch: true
      };
    } catch (_) {
      return {
        selectPage: handle.prepare(`
          SELECT
            u.id,
            u.url,
            u.host,
            u.canonical_url AS canonicalUrl,
            u.created_at AS createdAt,
            u.last_seen_at AS lastSeenAt,
            NULL AS lastFetchAt,
            NULL AS httpStatus,
            NULL AS classification,
            NULL AS wordCount
          FROM urls u
          ORDER BY u.id ASC
          LIMIT ? OFFSET ?
        `),
        countAll: handle.prepare(`SELECT COUNT(1) AS total FROM urls`),
        hasLatestFetch: false
      };
    }
  });
}

function mapRow(row) {
  return {
    id: row.id,
    url: row.url,
    host: row.host || null,
    canonicalUrl: row.canonicalUrl || null,
    createdAt: row.createdAt || null,
    lastSeenAt: row.lastSeenAt || null,
    lastFetchAt: row.lastFetchAt || null,
    httpStatus: row.httpStatus != null ? Number(row.httpStatus) : null,
    classification: row.classification || null,
    wordCount: row.wordCount != null ? Number(row.wordCount) : null
  };
}

function selectUrlPage(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectUrlPage requires a better-sqlite3 database handle");
  }
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });
  const { selectPage } = prepareStatements(db);
  return selectPage.all(limit, offset).map(mapRow);
}

function countUrls(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countUrls requires a better-sqlite3 database handle");
  }
  const { countAll } = prepareStatements(db);
  const row = countAll.get();
  const totalValue = row && row.total != null ? Number(row.total) : 0;
  return Number.isFinite(totalValue) ? totalValue : 0;
}

function selectInitialUrls(db, options = {}) {
  return selectUrlPage(db, { ...options, offset: 0 });
}

module.exports = {
  selectInitialUrls,
  selectUrlPage,
  countUrls
};
