'use strict';

const path = require('path');
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');
const Database = require(require.resolve('better-sqlite3', {
  paths: [REPO_ROOT, path.join(REPO_ROOT, '..', 'news-crawler-db'), __dirname]
}));
const {
  ensureSqlitePlaceHubUrlPatternsSchema,
  createPlaceHubUrlPatternsStore
} = require('news-crawler-db');
const { PlaceHubUrlIndex } = require('../PlaceHubUrlIndex');

/**
 * Place-hub URL intelligence (2026-07-16 slice): DB-stored patterns
 * (host-learned + global GOFAI priors) + gazetteer slugs classify URLs
 * without network; verified hubs are mined into persisted patterns;
 * bulk-404 of known hubs = structure drift → patterns reset.
 */

const fakeLookup = (slugMap) => ({
  findBySlug: (slug) => slugMap[slug] || [],
  findBest: () => null
});

const FR = [{ placeId: 7, kind: 'country', canonicalName: 'France', countryCode: 'FR', population: 68e6 }];

function makeDb() {
  const db = new Database(':memory:');
  ensureSqlitePlaceHubUrlPatternsSchema(db);
  db.exec(`
    CREATE TABLE non_geo_topic_slugs (slug TEXT PRIMARY KEY, label TEXT, lang TEXT, source TEXT);
    CREATE TABLE urls (id INTEGER PRIMARY KEY AUTOINCREMENT, url TEXT);
    CREATE TABLE place_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      host TEXT, place_slug TEXT, place_kind TEXT, title TEXT, url_id INTEGER
    );
    CREATE TABLE http_responses (id INTEGER PRIMARY KEY AUTOINCREMENT, url_id INTEGER, http_status INTEGER, fetched_at TEXT);
    CREATE TABLE place_hub_determinations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL, determination TEXT NOT NULL, reason TEXT,
      details_json TEXT, created_at TEXT
    );
  `);
  return db;
}

describe('PlaceHubUrlIndex.classifyUrl', () => {
  let db, store, index;

  beforeEach(() => {
    db = makeDb();
    store = createPlaceHubUrlPatternsStore(db);
    store.seedGlobalPriors();
    db.prepare("INSERT INTO non_geo_topic_slugs (slug) VALUES ('football')").run();
    index = new PlaceHubUrlIndex({
      db, store,
      lookup: fakeLookup({ france: FR }),
      logger: { warn: () => {} }
    });
  });
  afterEach(() => db.close());

  it('classifies a prior-matching URL with gazetteer boost', () => {
    const r = index.classifyUrl('https://www.newsite.example/world/france');
    expect(r.isPlaceHubCandidate).toBe(true);
    expect(r.place.name).toBe('France');
    expect(r.pattern.scope).toBe('global');
    expect(r.confidence).toBeGreaterThan(0.7); // 0.6 prior + 0.15 gazetteer
  });

  it('vetoes known non-geo topic slugs', () => {
    const r = index.classifyUrl('https://www.newsite.example/world/football');
    expect(r.isPlaceHubCandidate).toBe(false);
    expect(r.reasons.join()).toContain('non-geo-slug');
  });

  it('rejects date-shaped article paths', () => {
    const r = index.classifyUrl('https://www.newsite.example/world/2026/jul/16/story-about-france');
    expect(r.isPlaceHubCandidate).toBe(false);
    expect(r.reasons.join()).toContain('article-shaped');
  });

  it('gazetteer-only match yields a low-confidence candidate for verification', () => {
    const r = index.classifyUrl('https://www.newsite.example/france');
    expect(r.isPlaceHubCandidate).toBe(true);
    expect(r.provenance).toBe('gazetteer-slug');
    expect(r.confidence).toBeLessThan(0.5);
  });

  it('never throws on junk input', () => {
    expect(index.classifyUrl('not a url').isPlaceHubCandidate).toBe(false);
    expect(index.classifyUrl('').isPlaceHubCandidate).toBe(false);
  });
});

describe('PlaceHubUrlIndex.learnFromVerifiedHubs', () => {
  it('mines repeated templates into persisted host patterns', () => {
    const db = makeDb();
    const store = createPlaceHubUrlPatternsStore(db);
    const ins = db.prepare('INSERT INTO urls (url) VALUES (?)');
    const hub = db.prepare('INSERT INTO place_hubs (host, place_slug, place_kind, url_id) VALUES (?, ?, ?, ?)');
    const slugs = ['france', 'kenya', 'brazil', 'japan'];
    slugs.forEach((slug, i) => {
      ins.run(`https://site.example/world/${slug}`);
      hub.run('site.example', slug, 'country', i + 1);
    });
    // One-off URL shape should NOT become a pattern (below minCount)
    ins.run('https://site.example/special/one-off');
    hub.run('site.example', 'one-off', 'country', 5);

    const index = new PlaceHubUrlIndex({ db, store, lookup: null, logger: { warn: () => {} } });
    const report = index.learnFromVerifiedHubs('site.example');
    expect(report.verifiedHubRows).toBe(5);
    expect(report.patternsSaved).toHaveLength(1);
    expect(report.patternsSaved[0].template).toBe('/world/{slug}');
    expect(report.patternsSaved[0].count).toBe(4);

    // The learned pattern now classifies unseen URLs of the same shape.
    const match = store.matchUrlForHost('https://site.example/world/andorra', 'site.example');
    expect(match.matched).toBe(true);
    expect(match.scope).toBe('host');
    db.close();
  });
});

describe('PlaceHubUrlIndex.assessStructureHealth', () => {
  it('detects bulk-404 drift, resets host patterns, records determination', () => {
    const db = makeDb();
    const store = createPlaceHubUrlPatternsStore(db);
    store.savePattern({
      domain: 'site.example', patternType: 't', patternRegex: '\\/world\\/[a-z-]+$',
      accuracy: 0.9, scope: 'host'
    });
    const ins = db.prepare('INSERT INTO urls (url) VALUES (?)');
    const hub = db.prepare('INSERT INTO place_hubs (host, place_slug, place_kind, url_id) VALUES (?, ?, ?, ?)');
    const resp = db.prepare('INSERT INTO http_responses (url_id, http_status, fetched_at) VALUES (?, ?, ?)');
    for (let i = 0; i < 6; i++) {
      ins.run(`https://site.example/world/place-${i}`);
      hub.run('site.example', `place-${i}`, 'country', i + 1);
      resp.run(i + 1, i < 5 ? 404 : 200, new Date().toISOString()); // 5/6 dead
    }
    const index = new PlaceHubUrlIndex({ db, store, lookup: null, logger: { warn: () => {} } });
    const a = index.assessStructureHealth('site.example');
    expect(a.drifted).toBe(true);
    expect(a.applied).toBe(true);
    expect(a.patternsReset).toBe(1);
    const det = db.prepare("SELECT * FROM place_hub_determinations WHERE determination='structure-changed'").get();
    expect(det.domain).toBe('site.example');
    // Learned pattern no longer matches (accuracy zeroed)
    const match = store.matchUrlForHost('https://site.example/world/x', 'site.example');
    expect(match?.matched ?? false).toBe(false);
    db.close();
  });

  it('does not flag healthy hosts', () => {
    const db = makeDb();
    const store = createPlaceHubUrlPatternsStore(db);
    const ins = db.prepare('INSERT INTO urls (url) VALUES (?)');
    const hub = db.prepare('INSERT INTO place_hubs (host, place_slug, place_kind, url_id) VALUES (?, ?, ?, ?)');
    const resp = db.prepare('INSERT INTO http_responses (url_id, http_status, fetched_at) VALUES (?, ?, ?)');
    for (let i = 0; i < 6; i++) {
      ins.run(`https://ok.example/world/place-${i}`);
      hub.run('ok.example', `place-${i}`, 'country', i + 1);
      resp.run(i + 1, 200, new Date().toISOString());
    }
    const index = new PlaceHubUrlIndex({ db, store, lookup: null, logger: { warn: () => {} } });
    const a = index.assessStructureHealth('ok.example');
    expect(a.drifted).toBe(false);
    expect(a.applied).toBe(false);
    db.close();
  });
});
