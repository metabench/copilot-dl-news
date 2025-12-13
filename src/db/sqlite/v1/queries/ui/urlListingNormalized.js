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
          selectPageByHost: handle.prepare(`
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
            WHERE u.host = ? COLLATE NOCASE
            ORDER BY u.id ASC
            LIMIT ? OFFSET ?
          `),
          countAll: handle.prepare(`SELECT COUNT(1) AS total FROM urls`),
          countAllByHost: handle.prepare(`SELECT COUNT(1) AS total FROM urls WHERE host = ? COLLATE NOCASE`),
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
          selectPageByHost: handle.prepare(`
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
            WHERE u.host = ? COLLATE NOCASE
            ORDER BY u.id ASC
            LIMIT ? OFFSET ?
          `),
          countAll: handle.prepare(`SELECT COUNT(1) AS total FROM urls`),
          countAllByHost: handle.prepare(`SELECT COUNT(1) AS total FROM urls WHERE host = ? COLLATE NOCASE`),
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
          selectFetchedPageByHost: handle.prepare(`
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
            WHERE fu.host = ? COLLATE NOCASE
            ORDER BY fu.url_id ASC
            LIMIT ? OFFSET ?
          `),
          countFetched: handle.prepare(`SELECT COUNT(1) AS total FROM fetched_urls`),
          countFetchedByHost: handle.prepare(`SELECT COUNT(1) AS total FROM fetched_urls WHERE host = ? COLLATE NOCASE`),
          hasFetchedView: true
        };
      } catch (_) {
        try {
          const selectFetchedPage = handle.prepare(`
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
              NULL AS wordCount,
              COUNT(f.id) AS fetchCount
            FROM urls u
            INNER JOIN fetches f ON f.url_id = u.id
            GROUP BY u.id
            ORDER BY u.id ASC
            LIMIT ? OFFSET ?
          `);
          const selectFetchedPageByHost = handle.prepare(`
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
              NULL AS wordCount,
              COUNT(f.id) AS fetchCount
            FROM urls u
            INNER JOIN fetches f ON f.url_id = u.id
            WHERE u.host = ? COLLATE NOCASE
            GROUP BY u.id
            ORDER BY u.id ASC
            LIMIT ? OFFSET ?
          `);
          const countFetched = handle.prepare(`
            SELECT COUNT(DISTINCT url_id) AS total
            FROM fetches
          `);
          const countFetchedByHost = handle.prepare(`
            SELECT COUNT(DISTINCT u.id) AS total
            FROM urls u
            INNER JOIN fetches f ON f.url_id = u.id
            WHERE u.host = ? COLLATE NOCASE
          `);
          return {
            selectFetchedPage,
            selectFetchedPageByHost,
            countFetched,
            countFetchedByHost,
            hasFetchedView: false
          };
        } catch (_) {
          return {
            selectFetchedPage: handle.prepare(`
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
                NULL AS wordCount,
                NULL AS fetchCount
              FROM urls u
              WHERE 1=0
              ORDER BY u.id ASC
              LIMIT ? OFFSET ?
            `),
            selectFetchedPageByHost: handle.prepare(`
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
                NULL AS wordCount,
                NULL AS fetchCount
              FROM urls u
              WHERE 1=0
              ORDER BY u.id ASC
              LIMIT ? OFFSET ?
            `),
            countFetched: handle.prepare(`SELECT 0 AS total`),
            countFetchedByHost: handle.prepare(`SELECT 0 AS total`),
            hasFetchedView: false
          };
        }
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

function selectUrlPageByHost(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectUrlPageByHost requires a better-sqlite3 database handle");
  }
  const host = options.host != null ? String(options.host).trim() : "";
  if (!host) return [];
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });
  const { selectPageByHost } = prepareStatements(db);
  return selectPageByHost.all(host, limit, offset).map(mapRow);
}

function countUrlsByHost(db, host) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countUrlsByHost requires a better-sqlite3 database handle");
  }
  const normalized = host != null ? String(host).trim() : "";
  if (!normalized) return 0;
  const { countAllByHost } = prepareStatements(db);
  const row = countAllByHost.get(normalized);
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

function selectFetchedUrlPageByHost(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectFetchedUrlPageByHost requires a better-sqlite3 database handle");
  }
  const host = options.host != null ? String(options.host).trim() : "";
  if (!host) return [];
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });
  const { selectFetchedPageByHost } = prepareStatements(db);
  return selectFetchedPageByHost.all(host, limit, offset).map(mapRow);
}

function countFetchedUrlsByHost(db, host) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countFetchedUrlsByHost requires a better-sqlite3 database handle");
  }
  const normalized = host != null ? String(host).trim() : "";
  if (!normalized) return 0;
  const { countFetchedByHost } = prepareStatements(db);
  const row = countFetchedByHost.get(normalized);
  const totalValue = row && row.total != null ? Number(row.total) : 0;
  return Number.isFinite(totalValue) ? totalValue : 0;
}

function selectInitialUrls(db, options = {}) {
  return selectUrlPage(db, { ...options, offset: 0 });
}

// ---------------------------------------------------------------------------
// Extended filtering with hostMode (exact|prefix|contains) and multi-host
// ---------------------------------------------------------------------------
const VALID_HOST_MODES = new Set(["exact", "prefix", "contains"]);

function normalizeHostMode(value) {
  if (!value) return "exact";
  const lower = String(value).trim().toLowerCase();
  return VALID_HOST_MODES.has(lower) ? lower : "exact";
}

function parseHosts(value) {
  if (!value) return [];
  const items = (Array.isArray(value) ? value : [value])
    .flatMap((v) => (v ? String(v).split(",") : []))
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set(items)].slice(0, 50); // limit 50
}

function buildHostWhere(hostMode, hosts) {
  if (!hosts || hosts.length === 0) return { clause: "", params: [] };
  const mode = normalizeHostMode(hostMode);
  const placeholders = hosts.map(() => {
    if (mode === "prefix") return "host LIKE ? ESCAPE '\\'";
    if (mode === "contains") return "host LIKE ? ESCAPE '\\'";
    return "host = ? COLLATE NOCASE";
  });
  const clause = `(${placeholders.join(" OR ")})`;
  const params = hosts.map((h) => {
    const escaped = h.replace(/([%_\\])/g, "\\$1");
    if (mode === "prefix") return `${escaped}%`;
    if (mode === "contains") return `%${escaped}%`;
    return h;
  });
  return { clause, params };
}

function selectUrlPageFiltered(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectUrlPageFiltered requires a better-sqlite3 database handle");
  }
  const hosts = parseHosts(options.hosts || options.host);
  const hostMode = normalizeHostMode(options.hostMode);
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });

  const baseCols = `
    u.id,
    u.url,
    u.host,
    u.canonical_url AS canonicalUrl,
    u.created_at AS createdAt,
    u.last_seen_at AS lastSeenAt
  `;

  const { clause, params } = buildHostWhere(hostMode, hosts);
  const whereClause = clause ? `WHERE ${clause}` : "";
  const sql = `
    SELECT ${baseCols},
           NULL AS lastFetchAt,
           NULL AS httpStatus,
           NULL AS classification,
           NULL AS wordCount
    FROM urls u
    ${whereClause}
    ORDER BY u.id ASC
    LIMIT ? OFFSET ?
  `;
  return db.prepare(sql).all(...params, limit, offset).map(mapRow);
}

function countUrlsFiltered(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countUrlsFiltered requires a better-sqlite3 database handle");
  }
  const hosts = parseHosts(options.hosts || options.host);
  const hostMode = normalizeHostMode(options.hostMode);
  const { clause, params } = buildHostWhere(hostMode, hosts);
  const whereClause = clause ? `WHERE ${clause}` : "";
  const sql = `SELECT COUNT(1) AS total FROM urls ${whereClause}`;
  const row = db.prepare(sql).get(...params);
  const totalValue = row && row.total != null ? Number(row.total) : 0;
  return Number.isFinite(totalValue) ? totalValue : 0;
}

function selectFetchedUrlPageFiltered(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectFetchedUrlPageFiltered requires a better-sqlite3 database handle");
  }
  const hosts = parseHosts(options.hosts || options.host);
  const hostMode = normalizeHostMode(options.hostMode);
  const limit = sanitizeLimit(options.limit, { min: 1, max: 5000, fallback: 1000 });
  const offset = sanitizeOffset(options.offset, { min: 0, fallback: 0 });
  const { clause, params } = buildHostWhere(hostMode, hosts);
  const whereClause = clause ? `WHERE ${clause}` : "";

  // Try fetched_urls view first
  try {
    const sql = `
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
      ${whereClause}
      ORDER BY fu.url_id ASC
      LIMIT ? OFFSET ?
    `;
    return db.prepare(sql).all(...params, limit, offset).map(mapRow);
  } catch (_) {
    return [];
  }
}

function countFetchedUrlsFiltered(db, options = {}) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("countFetchedUrlsFiltered requires a better-sqlite3 database handle");
  }
  const hosts = parseHosts(options.hosts || options.host);
  const hostMode = normalizeHostMode(options.hostMode);
  const { clause, params } = buildHostWhere(hostMode, hosts);
  const whereClause = clause ? `WHERE ${clause}` : "";
  try {
    const sql = `SELECT COUNT(1) AS total FROM fetched_urls ${whereClause}`;
    const row = db.prepare(sql).get(...params);
    const totalValue = row && row.total != null ? Number(row.total) : 0;
    return Number.isFinite(totalValue) ? totalValue : 0;
  } catch (_) {
    return 0;
  }
}

module.exports = {
  selectInitialUrls,
  selectUrlPage,
  selectUrlPageByHost,
  countUrls,
  countUrlsByHost,
  selectFetchedUrlPage,
  selectFetchedUrlPageByHost,
  countFetchedUrls,
  countFetchedUrlsByHost,
  // Extended filtering
  selectUrlPageFiltered,
  countUrlsFiltered,
  selectFetchedUrlPageFiltered,
  countFetchedUrlsFiltered,
  normalizeHostMode,
  parseHosts
};
