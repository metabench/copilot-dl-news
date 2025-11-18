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
    const baseStatements = (() => {
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
    })();

    const fetchedStatements = (() => {
      try {
        return {
          selectFetchedPage: handle.prepare(`
            SELECT
              fu.url_id AS id,
              fu.url,
              fu.host,
              fu.canonical_url AS canonicalUrl,
              fu.url_created_at AS createdAt,
              fu.url_last_seen_at AS lastSeenAt,
              fu.last_fetched_at AS lastFetchAt,
              fu.last_http_status AS httpStatus,
              fu.last_classification AS classification,
              fu.last_word_count AS wordCount,
              fu.fetch_count AS fetchCount
            FROM fetched_urls fu
            ORDER BY fu.url_id ASC
            LIMIT ? OFFSET ?
          `),
          countFetched: handle.prepare(`SELECT COUNT(1) AS total FROM fetched_urls`),
          hasFetchedView: true
        };
      } catch (_) {
        const selectFetchedPage = handle.prepare(`
          SELECT
            url_id AS id,
            url,
            host,
            canonical_url AS canonicalUrl,
            url_created_at AS createdAt,
            url_last_seen_at AS lastSeenAt,
            last_fetched_at AS lastFetchAt,
            last_http_status AS httpStatus,
            last_classification AS classification,
            last_word_count AS wordCount,
            fetch_count AS fetchCount
          FROM fetched_urls
          ORDER BY url_id ASC
          LIMIT ? OFFSET ?
        `);
        const countFetched = handle.prepare(`SELECT COUNT(*) AS total FROM fetched_urls`);
        return {
          selectFetchedPage,
          countFetched,
          hasFetchedView: true
        };
      }
    })();

    return {
      ...baseStatements,
      ...fetchedStatements
    };
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
    wordCount: row.wordCount != null ? Number(row.wordCount) : null,
    fetchCount: row.fetchCount != null ? Number(row.fetchCount) : null
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

function selectFetchedUrlPage(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectFetchedUrlPage requires a better-sqlite3 database handle");
  }
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });
  const { selectFetchedPage } = prepareStatements(db);
  return selectFetchedPage.all(limit, offset).map(mapRow);
}

function countFetchedUrls(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countFetchedUrls requires a better-sqlite3 database handle");
  }
  const { countFetched } = prepareStatements(db);
  const row = countFetched.get();
  const totalValue = row && row.total != null ? Number(row.total) : 0;
  return Number.isFinite(totalValue) ? totalValue : 0;
}

function selectInitialUrls(db, options = {}) {
  return selectUrlPage(db, { ...options, offset: 0 });
}

module.exports = {
  selectInitialUrls,
  selectUrlPage,
  countUrls,
  selectFetchedUrlPage,
  countFetchedUrls
};
