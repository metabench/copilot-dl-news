#!/usr/bin/env node
'use strict';
// READ-ONLY: confirm the DB-backed sitemap cache is live in the given DB.
const path = require('path');
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
(async () => {
  const db = openNewsCrawlerDb(dbPath, { readonly: true });
  const out = { accessors: false, cached: {} };
  const KNOWN = [
    'http://www.theguardian.com/sitemaps/news.xml',
    'https://www.theguardian.com/sitemaps/news.xml',
    'http://www.theguardian.com/sitemaps/video.xml',
    'https://www.theguardian.com/sitemaps/video.xml'
  ];
  try {
    out.accessors = typeof db.coverage?.getSitemapCache === 'function';
    for (const u of KNOWN) {
      const rec = await db.coverage.getSitemapCache(u);
      if (rec) out.cached[u] = { etag: rec.etag, bytes: (rec.body || '').length, fetchedAt: rec.fetchedAt };
    }
  } catch (e) { out.error = e.message; }
  finally { try { db.close(); } catch (_) {} }
  console.log(JSON.stringify(out, null, 1));
})();
