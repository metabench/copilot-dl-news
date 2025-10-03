"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.domainSummary");

function prepareStatements(db) {
  return getCachedStatements(db, CACHE_KEY, (handle) => ({
    articlesByHost: handle.prepare(`
      SELECT COUNT(*) AS c
      FROM articles a
      JOIN urls u ON u.url = a.url
      WHERE LOWER(u.host) = ?
    `),
    fetchesDirect: handle.prepare('SELECT COUNT(*) AS c FROM fetches WHERE LOWER(host) = ?'),
    fetchesViaJoin: handle.prepare(`
      SELECT COUNT(*) AS c
      FROM fetches f
      JOIN urls u ON u.url = f.url
      WHERE LOWER(u.host) = ?
    `)
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
