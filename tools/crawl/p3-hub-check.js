#!/usr/bin/env node
'use strict';
// READ-ONLY: report hubs/hub_members populated in the DB (P3 live-population
// proof). Usage: node tools/crawl/p3-hub-check.js [--db data/news.db] [--since ISO]
const path = require('path');
const args = process.argv.slice(2);
function argOf(f, d){ const i=args.indexOf(f); return i>=0&&args[i+1]?args[i+1]:d; }
const dbPath = path.resolve(process.cwd(), argOf('--db', 'data/news.db'));
const since = argOf('--since', null);
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const db = openNewsCrawlerDb(dbPath, { readonly: true });
const out = {};
function safe(fn){ try { return fn(); } catch(e){ return 'ERR '+e.message; } }
out.hubsTotal = safe(()=>db.prepare('SELECT COUNT(*) n FROM hubs').get().n);
out.hubMembersTotal = safe(()=>db.prepare('SELECT COUNT(*) n FROM hub_members').get().n);
out.byKind = safe(()=>db.prepare('SELECT hub_kind, COUNT(*) n FROM hubs GROUP BY hub_kind').all());
const whereRecent = since ? "WHERE h.created_at >= ? OR h.updated_at >= ?" : '';
const params = since ? [since, since] : [];
out.recent = safe(()=>db.prepare(
  `SELECT h.id, h.host, h.canonical_slug, h.hub_kind, h.confidence, h.status,
          (SELECT COUNT(*) FROM hub_members m WHERE m.hub_id=h.id) AS members
   FROM hubs h ${whereRecent} ORDER BY h.id DESC LIMIT 10`).all(...params));
// Show members of the newest hub
out.newestMembers = safe(()=>{
  const [top] = db.prepare('SELECT id, canonical_slug FROM hubs ORDER BY id DESC LIMIT 1').all();
  if (!top) return null;
  return { slug: top.canonical_slug, members: db.prepare('SELECT member_type, place_slug, topic_slug, role, position FROM hub_members WHERE hub_id=? ORDER BY position').all(top.id) };
});
db.close();
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
