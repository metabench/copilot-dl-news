"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.urlDetails");
const TABLE_INFO_CACHE = new WeakMap();

function sanitizeTableName(name) {
  return String(name || "").replace(/[^A-Za-z0-9_]/g, "");
}

function getTableColumns(db, tableName) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("getTableColumns requires a better-sqlite3 handle");
  }
  const normalized = sanitizeTableName(tableName);
  if (!normalized) {
    return new Set();
  }
  let dbCache = TABLE_INFO_CACHE.get(db);
  if (!dbCache) {
    dbCache = new Map();
    TABLE_INFO_CACHE.set(db, dbCache);
  }
  if (dbCache.has(normalized)) {
    return dbCache.get(normalized);
  }
  const rows = db.prepare(`PRAGMA table_info("${normalized}")`).all();
  const columns = new Set(rows.map((row) => row.name));
  dbCache.set(normalized, columns);
  return columns;
}

function tableHasColumn(db, tableName, columnName) {
  return getTableColumns(db, tableName).has(columnName);
}

function buildFetchFileInfoSql(db) {
  return `
    SELECT id, NULL AS filePath, content_type AS contentType,
           content_encoding AS contentEncoding
    FROM http_responses
    WHERE id = ?
  `;
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    urlRecord: handle.prepare("SELECT * FROM urls WHERE url = ?"),
    urlById: handle.prepare(
      "SELECT id, url, host, canonical_url AS canonicalUrl, created_at AS createdAt, last_seen_at AS lastSeenAt, analysis FROM urls WHERE id = ?"
    ),
    fetchFileInfo: handle.prepare(buildFetchFileInfoSql(handle))
  }));
}

function selectUrlRecord(db, url) {
  const { urlRecord } = prepareStatements(db);
  return urlRecord.get(url) || null;
}

function selectUrlById(db, id) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("selectUrlById requires a better-sqlite3 handle");
  const { urlById } = prepareStatements(db);
  return urlById.get(id) || null;
}

function selectFetchHistory(db, urlId, options = {}) {
  if (!db || typeof db.prepare !== "function") throw new TypeError("selectFetchHistory requires a better-sqlite3 handle");
  const limit = Number(options.limit || 200);
  const offset = Number(options.offset || 0);
  const stmt = db.prepare(`
    SELECT 
      hr.id, 
      COALESCE(hr.fetched_at, hr.request_started_at) AS fetchedAt, 
      hr.http_status AS httpStatus, 
      hr.content_type AS contentType,
      hr.bytes_downloaded AS contentLength, 
      hr.bytes_downloaded AS bytesDownloaded, 
      NULL AS filePath,
      cs.uncompressed_size AS fileSize, 
      ca.classification, 
      ca.word_count AS wordCount
    FROM http_responses hr
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE hr.url_id = ?
    ORDER BY COALESCE(hr.fetched_at, hr.request_started_at) DESC, hr.id DESC
    LIMIT ? OFFSET ?
  `);
  return stmt.all(urlId, limit, offset).map((r) => ({
    id: r.id,
    fetchedAt: r.fetchedAt || null,
    httpStatus: r.httpStatus != null ? Number(r.httpStatus) : null,
    contentType: r.contentType || null,
    contentLength: r.contentLength != null ? Number(r.contentLength) : null,
    bytesDownloaded: r.bytesDownloaded != null ? Number(r.bytesDownloaded) : null,
    filePath: r.filePath || null,
    fileSize: r.fileSize != null ? Number(r.fileSize) : null,
    classification: r.classification || null,
    wordCount: r.wordCount != null ? Number(r.wordCount) : null
  }));
}

function selectFetchFileInfo(db, id) {
  const { fetchFileInfo } = prepareStatements(db);
  const row = fetchFileInfo.get(id);
  if (!row) return null;
  return {
    id: row.id,
    filePath: row.filePath || null,
    contentType: row.contentType || null,
    contentEncoding: row.contentEncoding || null
  };
}

/**
 * Select a single fetch (http_response) by ID with full details
 * @param {Object} db - better-sqlite3 database handle
 * @param {number} id - http_responses.id
 * @returns {Object|null} Fetch details or null if not found
 */
function selectFetchById(db, id) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectFetchById requires a better-sqlite3 handle");
  }
  const stmt = db.prepare(`
    SELECT 
      hr.id,
      hr.url_id AS urlId,
      hr.request_started_at AS requestStartedAt,
      hr.fetched_at AS fetchedAt,
      hr.http_status AS httpStatus,
      hr.content_type AS contentType,
      hr.content_encoding AS contentEncoding,
      hr.etag,
      hr.last_modified AS lastModified,
      hr.redirect_chain AS redirectChain,
      hr.ttfb_ms AS ttfbMs,
      hr.download_ms AS downloadMs,
      hr.total_ms AS totalMs,
      hr.bytes_downloaded AS bytesDownloaded,
      hr.transfer_kbps AS transferKbps,
      hr.cache_category AS cacheCategory,
      hr.cache_key AS cacheKey,
      hr.cache_created_at AS cacheCreatedAt,
      hr.cache_expires_at AS cacheExpiresAt,
      hr.request_method AS requestMethod,
      u.url,
      u.host,
      cs.id AS contentStorageId,
      cs.uncompressed_size AS fileSize,
      cs.compression_type_id AS compressionTypeId,
      cs.content_category AS contentCategory,
      cs.content_subtype AS contentSubtype,
      ca.classification,
      ca.word_count AS wordCount,
      ca.title AS articleTitle,
      ca.language AS articleLanguage
    FROM http_responses hr
    JOIN urls u ON u.id = hr.url_id
    LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
    LEFT JOIN content_analysis ca ON ca.content_id = cs.id
    WHERE hr.id = ?
  `);
  const row = stmt.get(id);
  if (!row) return null;
  
  // Parse redirect chain if present
  let redirectChain = null;
  if (row.redirectChain) {
    try {
      redirectChain = JSON.parse(row.redirectChain);
    } catch (_) {
      redirectChain = row.redirectChain;
    }
  }
  
  return {
    id: row.id,
    urlId: row.urlId,
    url: row.url,
    host: row.host,
    requestStartedAt: row.requestStartedAt || null,
    fetchedAt: row.fetchedAt || null,
    httpStatus: row.httpStatus != null ? Number(row.httpStatus) : null,
    contentType: row.contentType || null,
    contentEncoding: row.contentEncoding || null,
    etag: row.etag || null,
    lastModified: row.lastModified || null,
    redirectChain,
    timing: {
      ttfbMs: row.ttfbMs != null ? Number(row.ttfbMs) : null,
      downloadMs: row.downloadMs != null ? Number(row.downloadMs) : null,
      totalMs: row.totalMs != null ? Number(row.totalMs) : null
    },
    bytesDownloaded: row.bytesDownloaded != null ? Number(row.bytesDownloaded) : null,
    transferKbps: row.transferKbps != null ? Number(row.transferKbps) : null,
    cache: {
      category: row.cacheCategory || null,
      key: row.cacheKey || null,
      createdAt: row.cacheCreatedAt || null,
      expiresAt: row.cacheExpiresAt || null
    },
    requestMethod: row.requestMethod || "GET",
    storage: {
      id: row.contentStorageId || null,
      fileSize: row.fileSize != null ? Number(row.fileSize) : null,
      compressionTypeId: row.compressionTypeId || null
    },
    analysis: {
      classification: row.classification || null,
      wordCount: row.wordCount != null ? Number(row.wordCount) : null,
      contentCategory: row.contentCategory || null,
      contentSubtype: row.contentSubtype || null
    }
  };
}

module.exports = {
  selectUrlRecord,
  selectUrlById,
  selectFetchHistory,
  selectFetchFileInfo,
  selectFetchById
};
