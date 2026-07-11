#!/usr/bin/env node
'use strict';
// P0 smoke: prove sitemap_cache round-trips through the built news-crawler-db
// module against a SAMPLE db (never production). Copies the sample first.
const fs = require('fs');
const path = require('path');
const CANDIDATES = ['data/samples/c6-fail-probe.db', 'data/samples/c4-fail-probe.db'];
const SRC = CANDIDATES.map((c) => path.resolve(process.cwd(), c)).find((p) => fs.existsSync(p));
const DB = path.resolve(process.cwd(), 'data/samples/hub-p0-sample.db');
if (!fs.existsSync(DB)) {
  if (!SRC) { console.log(JSON.stringify({ error: 'no sample db found to copy' })); process.exit(1); }
  fs.copyFileSync(SRC, DB);
}

(async () => {
  const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
  const db = openNewsCrawlerDb(DB, { readonly: false });
  const out = { adapterHasAccessors: false, tableEnsured: false, roundTrip: null };
  try {
    const cov = db.coverage;
    out.adapterHasAccessors = typeof cov?.getSitemapCache === 'function' && typeof cov?.upsertSitemapCache === 'function';
    if (!out.adapterHasAccessors) throw new Error('accessors missing on coverage namespace');
    // Ensure table exists on this older sample (DDL is CREATE IF NOT EXISTS in
    // the module's schema definitions; adapters ensure at writer init — if this
    // sample predates the table, create via the module's exec surface).
    try {
      await cov.getSitemapCache('probe://x');
      out.tableEnsured = true;
    } catch (e) {
      if (/no such table/i.test(e.message) && typeof db.exec === 'function') {
        db.exec(`CREATE TABLE IF NOT EXISTS sitemap_cache (
          url TEXT PRIMARY KEY, body TEXT, etag TEXT, last_modified TEXT,
          content_type TEXT, fetched_at TEXT NOT NULL,
          created_at TEXT DEFAULT (datetime('now')), updated_at TEXT DEFAULT (datetime('now')))`);
        out.tableEnsured = 'created-inline';
      } else throw e;
    }
    const rec = { url: 'https://example.com/news.xml', body: '<urlset/>', etag: '"p0"', lastModified: null, contentType: 'application/xml', fetchedAt: new Date().toISOString() };
    await cov.upsertSitemapCache(rec);
    const got = await cov.getSitemapCache(rec.url);
    out.roundTrip = got && got.etag === '"p0"' && got.body === '<urlset/>' ? 'OK' : { got };
    // Update path too:
    await cov.upsertSitemapCache({ ...rec, etag: '"p0-v2"' });
    const got2 = await cov.getSitemapCache(rec.url);
    out.updatePath = got2 && got2.etag === '"p0-v2"' ? 'OK' : { got2 };
  } catch (err) {
    out.error = err.message;
  } finally {
    try { if (typeof db.close === 'function') db.close(); } catch (_) {}
  }
  console.log(JSON.stringify(out, null, 1));
})();
