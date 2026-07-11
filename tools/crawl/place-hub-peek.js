#!/usr/bin/env node
'use strict';
// READ-ONLY: show place_hub rows matching a host/slug filter.
// Usage: node tools/crawl/place-hub-peek.js [--db data/news.db] [--host theguardian] [--slug zimbabwe]
const path = require('path');
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const host = argOf('--host', '');
const slug = argOf('--slug', '');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });
const rows = db.prepare(
  `SELECT h.id, h.host, h.place_slug, h.title, h.place_kind, h.nav_links_count, h.article_links_count, h.last_seen_at, u.url
   FROM place_hubs h LEFT JOIN urls u ON u.id = h.url_id
   WHERE h.host LIKE ? AND h.place_slug LIKE ? ORDER BY h.last_seen_at DESC LIMIT 20`
).all(`%${host}%`, `%${slug}%`);
const total = db.prepare('SELECT COUNT(*) AS n FROM place_hubs').get().n;
db.close();
console.log(JSON.stringify({ totalHubs: total, matches: rows }, null, 1));
