#!/usr/bin/env node
'use strict';
// Prove sitemapCacheRaw resolveHandle unwraps NESTED wrappers (CrawlerDb →
// NewsDatabase → raw handle), then round-trips. Uses a sample sqlite as the
// real leaf handle. SAMPLE db only.
const fs = require('fs');
const path = require('path');
const SRC = ['data/samples/hub-p1-sample.db', 'data/samples/hub-p0-sample.db', 'data/samples/c6-fail-probe.db']
  .map((c) => path.resolve(process.cwd(), c)).find((p) => fs.existsSync(p));
const DB = path.resolve(process.cwd(), 'data/samples/hub-p0-resolve.db');
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.copyFileSync(SRC, DB);

const { sitemapCacheGet, sitemapCacheUpsert } = require('news-crawler-db');
// Real leaf handle: the drizzle adapter's underlying better-sqlite3. We reach
// it the same way the live crawler's CrawlerDb does — via getDb chains.
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const adapter = openNewsCrawlerDb(DB, { readonly: false });

// Find a leaf with .prepare by probing the adapter's own accessors.
function findLeaf(o, d = 0) {
  if (!o || d > 6) return null;
  if (typeof o.prepare === 'function') return o;
  for (const a of ['getHandle', 'getDb']) if (typeof o[a] === 'function') { try { const n = o[a](); const r = findLeaf(n, d + 1); if (r) return r; } catch {} }
  if (o.db) { const r = findLeaf(o.db, d + 1); if (r) return r; }
  return null;
}
const leaf = findLeaf(adapter);
const out = { leafFound: !!leaf };
if (leaf) {
  // Double-wrap it like the live crawler nests, then hand the OUTER wrapper to
  // the module accessors — they must unwrap to the leaf.
  const inner = { getDb: () => leaf };
  const outer = { getDb: () => inner };
  out.upsert = sitemapCacheUpsert(outer, { url: 'https://x/news.xml', body: '<urlset/>', etag: '"n1"', fetchedAt: new Date().toISOString() });
  const got = sitemapCacheGet(outer, 'https://x/news.xml');
  out.roundTrip = got && got.etag === '"n1"' && got.body === '<urlset/>' ? 'OK' : { got };
  out.result = out.upsert && out.roundTrip === 'OK' ? 'PASS' : 'CHECK';
} else {
  out.result = 'NO_LEAF';
}
try { if (typeof adapter.close === 'function') adapter.close(); } catch {}
console.log(JSON.stringify(out, null, 1));
