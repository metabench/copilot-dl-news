#!/usr/bin/env node
'use strict';
// Diagnose why sitemap_cache didn't populate during the activation crawl.
const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const dbPath = path.resolve(process.cwd(), 'data/news.db');
const out = {};
// 1. Did the crawl fetch sitemaps at all recently?
const rdb = openNewsCrawlerDb(dbPath, { readonly: true });
try {
  out.recentSitemapFetches = rdb.prepare(
    "SELECT COUNT(*) AS n FROM http_responses h JOIN urls u ON u.id=h.url_id " +
    "WHERE u.url LIKE '%sitemap%' AND u.url LIKE '%.xml' AND h.fetched_at >= datetime('now','-1 hour')"
  ).get().n;
} catch (e) { out.fetchQueryError = e.message; }
// 2. Does the adapter expose the coverage namespace with the new accessors?
out.adapterShape = {
  hasCoverage: !!rdb.coverage,
  coverageHasSitemapAccessors: !!(rdb.coverage && typeof rdb.coverage.getSitemapCache === 'function'),
};
rdb.close();
console.log(JSON.stringify(out, null, 1));
