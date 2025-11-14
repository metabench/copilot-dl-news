"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

// Normalized URL listing for UI views (uses urls + latest_fetch when available).

const CACHE_KEY = Symbol.for("db.sqlite.ui.urlListingNormalized");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => {
    try {
      return {
        selectFirst: handle.prepare(`
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
          LIMIT ?
        `),
        hasLatestFetch: true
      };
    } catch (_) {
      return {
        selectFirst: handle.prepare(`
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
          LIMIT ?
        `),
        hasLatestFetch: false
      };
    }
  });
}

function selectInitialUrls(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectInitialUrls requires a better-sqlite3 database handle");
  }
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const { selectFirst } = prepareStatements(db);
  return selectFirst.all(limit).map((row) => ({
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
  }));
}

module.exports = {
  selectInitialUrls
};
