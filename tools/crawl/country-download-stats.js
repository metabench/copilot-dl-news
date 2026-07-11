#!/usr/bin/env node
'use strict';
// READ-ONLY: downloads/articles per country. Two sources, both reported:
//  1. article_places (place_kind='country'): articles mentioning/tagged a country
//  2. place_hubs join: articles fetched under a country hub's URL prefix
// Usage: node tools/crawl/country-download-stats.js [--db data/news.db] [--limit 30]
const path = require('path');
const args = process.argv.slice(2);
function argOf(flag, dflt) { const i = args.indexOf(flag); return i >= 0 && args[i + 1] ? args[i + 1] : dflt; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const limit = Math.min(Number(argOf('--limit', 30)), 200);
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });
const out = {};
try {
  out.articlePlacesTotal = db.prepare("SELECT COUNT(*) AS n FROM article_places").get().n;
  out.byCountryTagged = db.prepare(
    `SELECT place AS country, COUNT(DISTINCT article_url_id) AS articles
     FROM article_places WHERE place_kind = 'country'
     GROUP BY place ORDER BY articles DESC LIMIT ${limit}`
  ).all();
} catch (e) { out.taggedError = e.message; }
try {
  out.byCountryHub = db.prepare(
    `SELECT h.place_slug AS country, COUNT(DISTINCT r.id) AS downloads
     FROM place_hubs h
     JOIN urls hu ON hu.id = h.url_id
     JOIN urls u ON u.host = h.host AND u.url LIKE (hu.url || '%')
     JOIN http_responses r ON r.url_id = u.id AND r.http_status BETWEEN 200 AND 299
     WHERE h.place_kind = 'country'
     GROUP BY h.place_slug ORDER BY downloads DESC LIMIT ${limit}`
  ).all();
} catch (e) { out.hubError = e.message; }
db.close();
console.log(JSON.stringify(out, null, 1).slice(0, 30000));
