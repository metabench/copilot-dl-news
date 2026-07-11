#!/usr/bin/env node
'use strict';
// Prove identifyAndPersistHub end-to-end against PRODUCTION (real gazetteer +
// seeded topics): URL → slug → segment → upsertHub. Creates hubs/hub_members
// (additive, CREATE IF NOT EXISTS via the accessor's ensure) and persists real
// hub rows. --db defaults to production news.db (additive DATA write, permitted).
const path = require('path');
const args = process.argv.slice(2);
function argOf(f, d){ const i=args.indexOf(f); return i>=0&&args[i+1]?args[i+1]:d; }
const dbRel = argOf('--db', 'data/news.db');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { identifyAndPersistHub } = require('../../src/core/crawler/hubs/hubIdentifier');

const URLS = [
  'https://www.theguardian.com/world/zimbabwe',
  'https://www.theguardian.com/world/russia-ukraine-war',
  'https://www.theguardian.com/world/new-caledonia'
];

(async () => {
  const out = { db: dbRel, results: [] };
  const db = openNewsCrawlerDb(path.resolve(process.cwd(), dbRel), { readonly: false });
  try {
    for (const url of URLS) {
      const r = await identifyAndPersistHub({ host: 'www.theguardian.com', url, adapter: db, status: 'candidate' });
      out.results.push({ url: url.split('/').slice(-1)[0], persisted: r.persisted, hubKind: r.hubKind, members: r.members, reason: r.reason, confidence: r.confidence });
    }
    // Read back the persisted composite to confirm ordered members.
    const cov = db.coverage || (db.db && db.db.coverage);
    if (cov && typeof cov.getHubWithMembers === 'function') {
      const ruw = await cov.getHubWithMembers('www.theguardian.com', 'russia-ukraine-war');
      out.russiaUkraineWar = ruw ? { hubKind: ruw.hubKind, members: (ruw.members||[]).map(m=>`${m.member_type||m.memberType}:${m.place_slug||m.placeSlug||m.topic_slug||m.topicSlug}@${m.position}`) } : null;
    }
  } catch (e) { out.error = e.message; out.stack = (e.stack||'').split('\n').slice(0,3).join(' | '); }
  finally { try { db.close(); } catch {} }
  console.log(JSON.stringify(out, null, 1).slice(0, 2500));
})();
