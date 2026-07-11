#!/usr/bin/env node
'use strict';
// P1 proof (SAMPLE db only): exercise the hubs/hub_members accessors through
// the built news-crawler-db module — place, topic, and COMPOSITE hubs, plus
// backfill of place_hubs → hubs. Never touches production news.db.
const fs = require('fs');
const path = require('path');
const CANDIDATES = ['data/samples/hub-p0-sample.db', 'data/samples/c6-fail-probe.db'];
const SRC = CANDIDATES.map((c) => path.resolve(process.cwd(), c)).find((p) => fs.existsSync(p));
const DB = path.resolve(process.cwd(), 'data/samples/hub-p1-sample.db');
if (fs.existsSync(DB)) fs.unlinkSync(DB);
fs.copyFileSync(SRC, DB);

(async () => {
  const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
  const db = openNewsCrawlerDb(DB, { readonly: false });
  const out = {};
  const cov = db.coverage;
  try {
    out.hasAccessors = ['upsertHub', 'replaceHubMembers', 'findHubs', 'getHubWithMembers', 'backfillHubsFromPlaceHubs']
      .every((m) => typeof cov[m] === 'function');

    // 1. Place hub (members passed inline; upsertHub handles member replace)
    await cov.upsertHub({ host: 'www.theguardian.com', canonicalSlug: 'zimbabwe', hubKind: 'place', title: 'Zimbabwe', confidence: 0.98,
      members: [{ memberType: 'place', placeSlug: 'zimbabwe', role: 'subject' }] });

    // 2. Topic hub
    await cov.upsertHub({ host: 'www.theguardian.com', canonicalSlug: 'technology', hubKind: 'topic', title: 'Technology', confidence: 0.95,
      members: [{ memberType: 'topic', topicSlug: 'technology', role: 'theme' }] });

    // 3. COMPOSITE — russia-ukraine-war = [place:russia, place:ukraine, topic:war]
    await cov.upsertHub({ host: 'www.theguardian.com', canonicalSlug: 'russia-ukraine-war', hubKind: 'composite', title: 'Russia-Ukraine war', confidence: 0.9,
      evidence: { parse: [{ token: 'russia', type: 'place' }, { token: 'ukraine', type: 'place' }, { token: 'war', type: 'topic' }] },
      members: [
        { memberType: 'place', placeSlug: 'russia', role: 'subject' },
        { memberType: 'place', placeSlug: 'ukraine', role: 'counterpart' },
        { memberType: 'topic', topicSlug: 'war', role: 'theme' }
      ] });

    const ruw = await cov.getHubWithMembers('www.theguardian.com', 'russia-ukraine-war');
    out.compositeMembers = (ruw.members || []).map((m) => `${m.memberType}:${m.placeSlug || m.topicSlug}@${m.position}`);
    out.compositeOk = ruw.hubKind === 'composite' && ruw.members.length === 3
      && ruw.members[0].placeSlug === 'russia' && ruw.members[1].placeSlug === 'ukraine'
      && ruw.members[2].memberType === 'topic' && ruw.members[2].topicSlug === 'war';

    // Idempotent upsert: same slug → update in place, no duplicate, members replaced not appended
    await cov.upsertHub({ host: 'www.theguardian.com', canonicalSlug: 'russia-ukraine-war', hubKind: 'composite', title: 'Russia-Ukraine war (upd)', confidence: 0.92,
      members: [
        { memberType: 'place', placeSlug: 'russia', role: 'subject' },
        { memberType: 'place', placeSlug: 'ukraine', role: 'counterpart' },
        { memberType: 'topic', topicSlug: 'war', role: 'theme' }
      ] });
    const ruw2 = await cov.getHubWithMembers('www.theguardian.com', 'russia-ukraine-war');
    out.noMemberDup = ruw2.members.length === 3; // replaced, not appended
    const composites = await cov.findHubs({ hubKind: 'composite' });
    out.oneComposite = composites.filter((h) => h.canonicalSlug === 'russia-ukraine-war').length === 1;

    // 4. Backfill from legacy place_hubs (sample has real rows)
    const bf = await cov.backfillHubsFromPlaceHubs();
    out.backfilled = bf.migrated;
    const places = await cov.findHubs({ hubKind: 'place', limit: 5 });
    out.samplePlaceHubs = places.slice(0, 3).map((h) => h.canonicalSlug);

    out.result = out.hasAccessors && out.compositeOk && out.noMemberDup && out.oneComposite ? 'PASS' : 'CHECK';
  } catch (err) {
    out.error = err.message;
    out.result = 'ERROR';
  } finally {
    try { if (typeof db.close === 'function') db.close(); } catch (_) {}
  }
  console.log(JSON.stringify(out, null, 1));
})();
