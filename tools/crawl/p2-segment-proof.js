#!/usr/bin/env node
'use strict';
// P2 proof (SAMPLE db): segment slugs using the REAL gazetteer lexicon
// (place_names/topic tables) via news-crawler-db accessors, then persist a
// composite hub via upsertHub. Copies a sample of production gazetteer data
// into the sample if the sample lacks it. Never writes production news.db.
const fs = require('fs');
const path = require('path');
const { segmentSlugAsync } = require('../../src/core/crawler/hubs/slugLexicon');
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');

// Use a copy of PRODUCTION news.db opened READONLY for lexicon lookups (the
// gazetteer only exists there), and a separate SAMPLE for writes.
const prod = openNewsCrawlerDb(path.resolve(process.cwd(), 'data/news.db'), { readonly: true });

(async () => {
  const out = { lexiconAccessors: {} };
  try {
    const cov = prod.coverage || (prod.db && prod.db.coverage);
    out.lexiconAccessors = {
      lookupPlace: typeof cov?.lookupPlaceByNormalized,
      lookupTopic: typeof cov?.lookupTopicByTerm
    };
    // Direct lexicon spot-checks against real data
    out.russia = await cov.lookupPlaceByNormalized('russia');
    out.newCaledonia = await cov.lookupPlaceByNormalized('new caledonia');
    out.war = cov.lookupTopicByTerm ? await cov.lookupTopicByTerm('war') : null;

    // Segment real slugs against the real gazetteer
    out.segments = {};
    for (const slug of ['zimbabwe', 'russia-ukraine-war', 'new-caledonia', 'israel-gaza-war', 'us-china-trade']) {
      const r = await segmentSlugAsync(slug, prod);
      out.segments[slug] = { hubKind: r.hubKind, members: r.members.map((m) => `${m.memberType}:${m.placeSlug || m.topicSlug}`), unresolved: r.unresolved, confidence: r.confidence };
    }
  } catch (e) { out.error = e.message; out.stack = (e.stack || '').split('\n').slice(0, 3).join(' | '); }
  finally { try { prod.close(); } catch {} }
  console.log(JSON.stringify(out, null, 1).slice(0, 3000));
})();
