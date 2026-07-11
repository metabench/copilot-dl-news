#!/usr/bin/env node
'use strict';
// Did the crawl's HubSeeder fire? Compare legacy place_hubs vs new hubs since t0.
const path = require('path');
const args = process.argv.slice(2);
function argOf(f,d){ const i=args.indexOf(f); return i>=0&&args[i+1]?args[i+1]:d; }
const since = argOf('--since', null);
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(path.resolve(process.cwd(), 'data/news.db'), { readonly: true });
const out = {};
function safe(fn){ try { return fn(); } catch(e){ return 'ERR '+e.message; } }
// place_hubs has no created_at; use last_seen_at
out.placeHubsRecent = since ? safe(()=>db.prepare("SELECT COUNT(*) n FROM place_hubs WHERE last_seen_at >= ?").get(since).n) : 'n/a';
out.placeHubsTotal = safe(()=>db.prepare("SELECT COUNT(*) n FROM place_hubs").get().n);
out.hubsRecent = since ? safe(()=>db.prepare("SELECT COUNT(*) n FROM hubs WHERE created_at >= ? OR updated_at >= ?").get(since,since).n) : 'n/a';
out.hubsTotal = safe(()=>db.prepare("SELECT COUNT(*) n FROM hubs").get().n);
// newest place_hubs
out.newestPlaceHubs = safe(()=>db.prepare("SELECT host, place_slug, last_seen_at FROM place_hubs ORDER BY last_seen_at DESC LIMIT 5").all());
db.close();
console.log(JSON.stringify(out, null, 1).slice(0,1500));
