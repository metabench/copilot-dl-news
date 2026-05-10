"use strict";

const { getCachedStatements } = require("../helpers");

const CACHE_KEY = Symbol.for("db.sqlite.ui.domainCounts");

function prepareCache(db) {
  return getCachedStatements(db, CACHE_KEY, () => ({
    statements: new Map()
  }));
}

function normalizeHosts(hosts) {
  if (!hosts) return [];
  const input = Array.isArray(hosts) ? hosts : [hosts];
  const normalized = [];
  const seen = new Set();
  for (const value of input) {
    if (value == null) continue;
    const host = String(value).trim().toLowerCase();
    if (!host) continue;
    if (seen.has(host)) continue;
    seen.add(host);
    normalized.push(host);
  }
  return normalized;
}

function placeholders(count) {
  if (!Number.isFinite(count) || count <= 0) return "";
  return new Array(count).fill("?").join(", ");
}

function getOrPrepare(db, cache, sql) {
  if (cache.statements.has(sql)) {
    return cache.statements.get(sql);
  }
  const stmt = db.prepare(sql);
  cache.statements.set(sql, stmt);
  return stmt;
}

function rowsToCountMap(rows) {
  const map = Object.create(null);
  (rows || []).forEach((row) => {
    if (!row) return;
    const host = row.host != null ? String(row.host) : "";
    if (!host) return;
    map[host] = typeof row.c === "number" ? row.c : Number(row.c) || 0;
  });
  return map;
}

function selectFetchCountsByHosts(db, normalizedHosts) {
  if (!db) return Object.create(null);
  const list = normalizeHosts(normalizedHosts);
  if (list.length === 0) return Object.create(null);

  const cache = prepareCache(db);
  const inClause = placeholders(list.length);

  try {
    const sql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS c
      FROM http_responses hr
      JOIN urls u ON u.id = hr.url_id
      WHERE LOWER(u.host) IN (${inClause})
      GROUP BY LOWER(u.host)
    `;
    const stmt = getOrPrepare(db, cache, sql);
    return rowsToCountMap(stmt.all(...list));
  } catch (_) {
    const sql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS c
      FROM fetches f
      JOIN urls u ON u.url = f.url
      WHERE LOWER(u.host) IN (${inClause})
      GROUP BY LOWER(u.host)
    `;
    const stmt = getOrPrepare(db, cache, sql);
    return rowsToCountMap(stmt.all(...list));
  }
}

function selectArticleCountsByHosts(db, normalizedHosts) {
  if (!db) return Object.create(null);
  const list = normalizeHosts(normalizedHosts);
  if (list.length === 0) return Object.create(null);

  const cache = prepareCache(db);
  const inClause = placeholders(list.length);

  try {
    const sql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS c
      FROM http_responses hr
      JOIN urls u ON u.id = hr.url_id
      JOIN content_storage cs ON cs.http_response_id = hr.id
      JOIN content_analysis ca ON ca.content_id = cs.id
      WHERE LOWER(u.host) IN (${inClause}) AND ca.classification = 'article'
      GROUP BY LOWER(u.host)
    `;
    const stmt = getOrPrepare(db, cache, sql);
    return rowsToCountMap(stmt.all(...list));
  } catch (_) {
    const sql = `
      SELECT LOWER(u.host) AS host, COUNT(*) AS c
      FROM articles a
      JOIN urls u ON u.url = a.url
      WHERE LOWER(u.host) IN (${inClause})
      GROUP BY LOWER(u.host)
    `;
    const stmt = getOrPrepare(db, cache, sql);
    return rowsToCountMap(stmt.all(...list));
  }
}

function selectDomainCountsByHosts(db, hosts) {
  const normalized = normalizeHosts(hosts);
  if (normalized.length === 0) {
    return Object.create(null);
  }
  const fetches = selectFetchCountsByHosts(db, normalized);
  const articles = selectArticleCountsByHosts(db, normalized);
  const result = Object.create(null);
  normalized.forEach((host) => {
    result[host] = {
      fetches: fetches[host] || 0,
      allArticles: articles[host] || 0
    };
  });
  return result;
}

module.exports = {
  selectDomainCountsByHosts
};
