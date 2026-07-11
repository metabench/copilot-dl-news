#!/usr/bin/env node
'use strict';
// READ-ONLY: confirm sitemap_cache activated in production news.db after the
// activation crawl (hub-loop run 2). Reports row count + a sample record.
const path = require('path');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(path.resolve(process.cwd(), 'data/news.db'), { readonly: true });
const out = {};
try {
  out.sitemapCacheRows = db.prepare('SELECT COUNT(*) AS n FROM sitemap_cache').get().n;
  out.sample = db.prepare("SELECT url, etag, length(body) AS body_len, fetched_at FROM sitemap_cache ORDER BY fetched_at DESC LIMIT 3").all();
} catch (e) { out.error = e.message; }
db.close();
console.log(JSON.stringify(out, null, 1));
