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

module.exports = {
  selectUrlRecord,
  selectUrlById,
  selectFetchHistory,
  selectFetchFileInfo
};
