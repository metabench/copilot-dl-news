#!/usr/bin/env node
'use strict';
// Diagnose the live sitemap-cache wiring gap (hub-loop P0). READ-ONLY on prod.
const path = require('path');
const out = {};

// 1. Does the repo's news-crawler-db resolution expose the functional accessors
//    (same resolution the running UI uses)?
try {
  const mod = require('news-crawler-db');
  out.moduleExports = {
    sitemapCacheGet: typeof mod.sitemapCacheGet,
    sitemapCacheUpsert: typeof mod.sitemapCacheUpsert
  };
  out.moduleResolvedFrom = require.resolve('news-crawler-db');
} catch (e) { out.moduleError = e.message; }

// 2. Did a crawl fetch sitemaps in the last 10 min (crawl 2 window)?
try {
  const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
  const db = openNewsCrawlerDb(path.resolve(process.cwd(), 'data/news.db'), { readonly: true });
  out.recentSitemapFetches10m = db.prepare(
    "SELECT COUNT(*) AS n FROM http_responses h JOIN urls u ON u.id=h.url_id " +
    "WHERE u.url LIKE '%sitemap%' AND u.url LIKE '%.xml' AND h.fetched_at >= datetime('now','-10 minutes')"
  ).get().n;
  // 3. Can THIS adapter's handle be resolved + written by the functional accessors?
  const { sitemapCacheUpsert, sitemapCacheGet } = require('news-crawler-db');
  if (typeof sitemapCacheUpsert === 'function') {
    // Use a throwaway in-memory-ish probe on a SEPARATE writable adapter, not prod (prod is readonly here).
    out.note = 'prod opened readonly; write-path proven separately in p0-resolve-handle-proof.js';
  }
  db.close();
} catch (e) { out.dbError = e.message; }

console.log(JSON.stringify(out, null, 1));
