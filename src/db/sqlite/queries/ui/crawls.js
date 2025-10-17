"use strict";

const { getCachedStatements, sanitizeLimit } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.crawls");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    listRecent: handle.prepare(`
      SELECT
        j.id,
        j.url,
        j.args,
        j.pid,
        j.started_at AS startedAt,
        j.ended_at AS endedAt,
        j.status,
        j.crawl_type_id AS crawlTypeId,
        ct.name AS crawlType,
        ct.description AS crawlTypeDescription
      FROM crawl_jobs j
      LEFT JOIN crawl_types ct ON ct.id = j.crawl_type_id
      ORDER BY COALESCE(j.ended_at, j.started_at) DESC
      LIMIT ?
    `),
    listCompleted: handle.prepare(`
      SELECT
        j.id,
        j.url,
        j.args,
        j.pid,
        j.started_at AS startedAt,
        j.ended_at AS endedAt,
        j.status,
        j.crawl_type_id AS crawlTypeId,
        ct.name AS crawlType,
        ct.description AS crawlTypeDescription
      FROM crawl_jobs j
      LEFT JOIN crawl_types ct ON ct.id = j.crawl_type_id
      WHERE j.ended_at IS NOT NULL
      ORDER BY j.ended_at DESC
      LIMIT ?
    `)
  }));
}

function listRecentCrawls(db, options = {}) {
  const { listRecent } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { max: 200, fallback: 50 });
  return listRecent.all(safeLimit);
}

function listCompletedCrawls(db, options = {}) {
  const { listCompleted } = prepareStatements(db);
  const safeLimit = sanitizeLimit(options.limit, { max: 200, fallback: 50 });
  return listCompleted.all(safeLimit);
}

module.exports = {
  listRecentCrawls,
  listCompletedCrawls
};
