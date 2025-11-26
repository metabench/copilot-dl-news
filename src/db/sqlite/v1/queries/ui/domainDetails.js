"use strict";

const { sanitizeLimit } = require("../helpers");

function assertDb(db) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("domainDetails queries require a better-sqlite3 handle");
  }
}

function selectHostSummary(db, host) {
  assertDb(db);
  if (!host) return null;
  const stmt = db.prepare(`
    SELECT LOWER(host) AS host,
           COUNT(*) AS urlCount,
           MIN(created_at) AS firstSeenAt,
           MAX(last_seen_at) AS lastSeenAt
    FROM urls
    WHERE LOWER(host) = ?
  `);
  const row = stmt.get(host);
  if (!row || row.urlCount == null || Number(row.urlCount) === 0) {
    return null;
  }
  return {
    host: row.host,
    urlCount: Number(row.urlCount) || 0,
    firstSeenAt: row.firstSeenAt || null,
    lastSeenAt: row.lastSeenAt || null
  };
}

function selectHostDownloads(db, host, options = {}) {
  assertDb(db);
  if (!host) return [];
  const limit = sanitizeLimit(options.limit, { min: 1, max: 500, fallback: 200 });
  const offset = Number.isFinite(Number(options.offset)) ? Math.max(0, Math.trunc(Number(options.offset))) : 0;
  const stmt = db.prepare(`
    SELECT
      hr.id,
      hr.url_id AS urlId,
      u.url,
      hr.fetched_at AS fetchedAt,
      hr.request_started_at AS requestedAt,
      hr.http_status AS httpStatus,
      cs.uncompressed_size AS contentLength,
      hr.bytes_downloaded AS bytesDownloaded,
      ca.word_count AS wordCount,
      ca.classification
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE LOWER(u.host) = ?
    ORDER BY COALESCE(hr.fetched_at, hr.request_started_at) DESC, hr.id DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(host, limit, offset).map((row) => ({
    id: row.id,
    urlId: row.urlId,
    url: row.url,
    fetchedAt: row.fetchedAt || row.requestedAt || null,
    httpStatus: row.httpStatus != null ? Number(row.httpStatus) : null,
    contentLength: row.contentLength != null ? Number(row.contentLength) : null,
    bytesDownloaded: row.bytesDownloaded != null ? Number(row.bytesDownloaded) : null,
    wordCount: row.wordCount != null ? Number(row.wordCount) : null,
    classification: row.classification || null
  }));
}

module.exports = {
  selectHostSummary,
  selectHostDownloads
};
