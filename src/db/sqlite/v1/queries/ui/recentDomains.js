"use strict";

const { getCachedStatements, tableHasColumn } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.recentDomains");

function buildRecentSelectBlock(refColumn, tsColumn) {
  if (!refColumn || !tsColumn) {
    return `
      SELECT ref, ts FROM (
        SELECT NULL AS ref, NULL AS ts
        LIMIT ?
      )
    `;
  }
  return `
      SELECT ref, ts FROM (
        SELECT ${refColumn} AS ref, ${tsColumn} AS ts
        FROM fetches
        WHERE ${refColumn} IS NOT NULL AND ${tsColumn} IS NOT NULL
        ORDER BY ${tsColumn} DESC
        LIMIT ?
      )
    `;
}

function buildRecentDomainsSql(db) {
  const hasUrlId = tableHasColumn(db, "fetches", "url_id");
  const hasUrlText = tableHasColumn(db, "fetches", "url");
  if (!hasUrlId && !hasUrlText) {
    throw new Error("fetches table is missing both url_id and url columns required for selectRecentDomains");
  }
  const refColumn = hasUrlId ? "url_id" : "url";
  const joinClause = hasUrlId ? "JOIN urls u ON u.id = w.ref" : "JOIN urls u ON u.url = w.ref";
  const hasRequestStarted = tableHasColumn(db, "fetches", "request_started_at");
  const hasCrawledAt = tableHasColumn(db, "fetches", "crawled_at");
  const secondaryColumn = hasCrawledAt
    ? "crawled_at"
    : (hasRequestStarted ? "request_started_at" : null);

  const recentBlock = buildRecentSelectBlock(refColumn, "fetched_at");
  const secondaryBlock = secondaryColumn
    ? buildRecentSelectBlock(refColumn, secondaryColumn)
    : buildRecentSelectBlock(null, null);

  return `
    WITH recent AS (
      ${recentBlock}
      UNION ALL
      ${secondaryBlock}
    ), windowed AS (
      SELECT ref, ts FROM recent WHERE ref IS NOT NULL ORDER BY ts DESC LIMIT ?
    )
    SELECT LOWER(u.host) AS host,
           COUNT(*) AS article_count,
           MAX(w.ts) AS last_saved_at
    FROM windowed w
    ${joinClause}
    WHERE u.host IS NOT NULL AND TRIM(u.host) <> ''
    GROUP BY LOWER(u.host)
    ORDER BY last_saved_at DESC
    LIMIT ?
  `;
}

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    selectRecent: handle.prepare(buildRecentDomainsSql(handle))
  }));
}

function selectRecentDomains(db, { windowSize, limit }) {
  if (!db || typeof db.prepare !== "function") {
    throw new TypeError("selectRecentDomains requires a database handle");
  }
  const windowN = Number(windowSize) || 2000;
  const safeLimit = Number.isFinite(Number(limit)) && Number(limit) > 0 ? Number(limit) : 20;
  const { selectRecent } = prepareStatements(db);
  return selectRecent.all(windowN, windowN, windowN, safeLimit);
}

module.exports = {
  selectRecentDomains
};
