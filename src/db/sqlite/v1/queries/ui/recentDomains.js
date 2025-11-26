"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.recentDomains");

function buildRecentDomainsSql() {
  return `
    WITH recent AS (
      SELECT url_id, COALESCE(fetched_at, request_started_at) AS ts
      FROM http_responses
      WHERE url_id IS NOT NULL
      ORDER BY ts DESC
      LIMIT ?
    )
    SELECT LOWER(u.host) AS host,
           COUNT(*) AS article_count,
           MAX(r.ts) AS last_saved_at
    FROM recent r
    JOIN urls u ON u.id = r.url_id
    WHERE u.host IS NOT NULL AND TRIM(u.host) <> ''
    GROUP BY LOWER(u.host)
    ORDER BY last_saved_at DESC
    LIMIT ?
  `;
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    selectRecent: handle.prepare(buildRecentDomainsSql())
  }));
}

function selectRecentDomains(db, { windowSize, limit }) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectRecentDomains requires a database handle");
  }
  const windowN = Number(windowSize) || 2000;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
  const { selectRecent } = prepareStatements(db);
  return selectRecent.all(windowN, safeLimit);
}

module.exports = {
  selectRecentDomains
};
