"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.domainSummary");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    articlesByHost: (() => {
      try {
        return handle.prepare(`
          SELECT COUNT(*) AS c
          FROM http_responses hr
          JOIN urls u ON u.id = hr.url_id
          JOIN content_storage cs ON cs.http_response_id = hr.id
          JOIN content_analysis ca ON ca.content_id = cs.id
          WHERE LOWER(u.host) = ? AND ca.classification = 'article'
        `);
      } catch (_) {
        // Fall back to legacy articles table if it exists
        return handle.prepare(`
          SELECT COUNT(*) AS c
          FROM articles a
          JOIN urls u ON u.url = a.url
          WHERE LOWER(u.host) = ?
        `);
      }
    })(),
    fetchesDirect: (() => {
      try {
        return handle.prepare(`
          SELECT COUNT(*) AS c
          FROM http_responses hr
          JOIN urls u ON u.id = hr.url_id
          WHERE LOWER(u.host) = ?
        `);
      } catch (_) {
        return null;
      }
    })(),
    fetchesViaJoin: (() => {
      try {
        return handle.prepare(`
          SELECT COUNT(*) AS c
          FROM http_responses hr
          JOIN urls u ON u.id = hr.url_id
          WHERE LOWER(u.host) = ?
        `);
      } catch (_) {
        return handle.prepare(`
          SELECT COUNT(*) AS c
          FROM fetches f
          JOIN urls u ON u.url = f.url
          WHERE LOWER(u.host) = ?
        `);
      }
    })()
  }));
}

function safeGetCount(stmt, host) {
  try {
    const row = stmt.get(host);
    return row && typeof row.c === "number" ? row.c : 0;
  } catch (error) {
    return 0;
  }
}

function getArticleCount(db, host) {
  const { articlesByHost } = prepareStatements(db);
  return safeGetCount(articlesByHost, host);
}

function getFetchCountDirect(db, host) {
  const { fetchesDirect } = prepareStatements(db);
  if (!fetchesDirect) return 0;
  return safeGetCount(fetchesDirect, host);
}

function getFetchCountViaJoin(db, host) {
  const { fetchesViaJoin } = prepareStatements(db);
  return safeGetCount(fetchesViaJoin, host);
}

module.exports = {
  getArticleCount,
  getFetchCountDirect,
  getFetchCountViaJoin
};
