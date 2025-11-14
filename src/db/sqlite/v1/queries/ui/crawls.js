"use strict";

const { getCachedStatements, sanitizeLimit, tableHasColumn } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.crawls");

function buildUrlFragments(db) {
  const hasJobUrl = tableHasColumn(db, "crawl_jobs", "url");
  const hasUrlId = tableHasColumn(db, "crawl_jobs", "url_id");
  if (hasJobUrl) {
    return {
      select: "j.url AS url",
      join: ""
    };
  }
  if (hasUrlId) {
    return {
      select: "COALESCE(u.canonical_url, u.url) AS url",
      join: "LEFT JOIN urls u ON u.id = j.url_id"
    };
  }
  return {
    select: "NULL AS url",
    join: ""
  };
}

function buildCrawlQuery({ fragments, completedOnly }) {
  const whereClause = completedOnly ? "WHERE j.ended_at IS NOT NULL" : "";
  const orderClause = completedOnly ? "ORDER BY j.ended_at DESC" : "ORDER BY COALESCE(j.ended_at, j.started_at) DESC";
  return `
      SELECT
        j.id,
        ${fragments.select},
        j.args,
        j.pid,
        j.started_at AS startedAt,
        j.ended_at AS endedAt,
        j.status,
        j.crawl_type_id AS crawlTypeId,
        ct.name AS crawlType,
        ct.description AS crawlTypeDescription
      FROM crawl_jobs j
      ${fragments.join}
      LEFT JOIN crawl_types ct ON ct.id = j.crawl_type_id
      ${whereClause}
      ${orderClause}
      LIMIT ?
    `;
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => {
    const fragments = buildUrlFragments(handle);
    return {
      listRecent: handle.prepare(buildCrawlQuery({ fragments, completedOnly: false })),
      listCompleted: handle.prepare(buildCrawlQuery({ fragments, completedOnly: true }))
    };
  });
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
