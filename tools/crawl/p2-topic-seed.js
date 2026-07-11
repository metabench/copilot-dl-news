#!/usr/bin/env node
'use strict';
// Seed a curated event/theme topic set into non_geo_topic_slugs via the module
// accessor, then re-segment the composite set to confirm full resolution.
// --db defaults to a SAMPLE; pass --db data/news.db for the (permitted, additive)
// production data write once sample-proven.
const path = require('path');
const args = process.argv.slice(2);
function argOf(f, d){ const i=args.indexOf(f); return i>=0&&args[i+1]?args[i+1]:d; }
const dbRel = argOf('--db', 'data/samples/hub-p1-sample.db');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
const { segmentSlugAsync } = require('../../src/core/crawler/hubs/slugLexicon');

const TOPICS = [
  'war','trade','crisis','election','protest','floods','earthquake','wildfire',
  'ceasefire','summit','sanctions','conflict','strike','referendum','coup',
  'pandemic','drought','famine','migration','inflation'
].map((s) => ({ slug: s, label: s[0].toUpperCase()+s.slice(1), source: 'hub-loop-P2-seed' }));

(async () => {
  const out = { db: dbRel };
  const db = openNewsCrawlerDb(path.resolve(process.cwd(), dbRel), { readonly: false });
  try {
    const cov = db.coverage || (db.db && db.db.coverage);
    if (!cov || typeof cov.upsertTopicSlugs !== 'function') throw new Error('upsertTopicSlugs accessor missing');
    out.seed = await cov.upsertTopicSlugs(TOPICS);
    // Re-segment the composite set now that topics exist (needs gazetteer too;
    // only meaningful on a db that has place_names, i.e. production).
    out.segments = {};
    for (const slug of ['russia-ukraine-war','israel-gaza-war','us-china-trade','new-caledonia']) {
      const r = await segmentSlugAsync(slug, db);
      out.segments[slug] = { hubKind: r.hubKind, members: r.members.map((m)=>`${m.memberType}:${m.placeSlug||m.topicSlug}`), unresolved: r.unresolved };
    }
  } catch (e) { out.error = e.message; }
  finally { try { db.close(); } catch {} }
  console.log(JSON.stringify(out, null, 1).slice(0, 2500));
})();
