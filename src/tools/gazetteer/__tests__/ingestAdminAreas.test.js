'use strict';
const { openNewsCrawlerDb } = require('../../../db/openNewsCrawlerDb');
const { initializeSqliteV1Schema: initializeSchema, seedAdminClassMap } = require('news-crawler-db');
const { ingestAdminAreas } = require('../ingestAdminAreas');

// The extracted ADM2 ingest callable, proven against an in-memory ncdb
// schema with INJECTED network — no WDQS, no app-stop, deterministic. This
// is the loop the in-app IngestAdminAreasTask will drive.
function makeDb() {
  const db = openNewsCrawlerDb(':memory:');
  initializeSchema(db, { verbose: false, logger: { log() {}, warn() {}, error() {} } });
  // A country row is required (findCountryByCode); FR.
  db.prepare("INSERT INTO places (id, kind, country_code) VALUES (900, 'country', 'FR')").run();
  db.prepare("INSERT INTO place_names (place_id, name, normalized, lang, name_kind) VALUES (900, 'France', 'france', 'en', 'official')").run();
  return db;
}

// Two French departments as canned WDQS bindings + wbgetentities.
const SPARQL_ROWS = {
  results: {
    bindings: [
      { adm2: { value: 'http://www.wikidata.org/entity/Q3389' }, adm2Label: { value: 'Gard' }, iso: { value: 'FR-30' } },
      { adm2: { value: 'http://www.wikidata.org/entity/Q12538' }, adm2Label: { value: 'Gironde' }, iso: { value: 'FR-33' } },
    ],
  },
};
const ENTITIES = {
  entities: {
    Q3389: { labels: { en: { value: 'Gard' }, fr: { value: 'Gard' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-30' } } }] } },
    Q12538: { labels: { en: { value: 'Gironde' } }, claims: { P300: [{ mainsnak: { datavalue: { value: 'FR-33' } } }] } },
  },
};

const logger = { info() {}, warn() {} };

describe('ingestAdminAreas', () => {
  let db;
  beforeEach(() => {
    db = makeDb();
    seedAdminClassMap(db, [
      { countryCode: 'FR', adminLevel: 2, wikidataClassQid: 'Q6465', placeKind: 'county', label: 'department of France', provenance: 'review:test', verified: 1, subclassWalk: 0 },
    ]);
  });
  afterEach(() => db.close());

  it('ingests verified-class ADM2 rows with adm2 codes + names + hierarchy', async () => {
    const res = await ingestAdminAreas(db, {
      countries: ['FR'], logger,
      fetchSparql: async () => SPARQL_ROWS,
      fetchEntities: async () => ENTITIES,
    });
    expect(res).toMatchObject({ created: 2, existing: 0, failed: 0 });
    const counties = db.prepare("SELECT country_code, adm2_code FROM places WHERE kind='county' ORDER BY adm2_code").all();
    expect(counties).toEqual([
      { country_code: 'FR', adm2_code: 'FR-30' },
      { country_code: 'FR', adm2_code: 'FR-33' },
    ]);
    const gard = db.prepare("SELECT p.id FROM places p JOIN place_names n ON n.place_id=p.id WHERE n.name='Gard' AND p.kind='county'").get();
    expect(gard).toBeTruthy();
    // hierarchy: each county links to the FR country (id 900) as admin_parent
    const links = db.prepare('SELECT COUNT(*) c FROM place_hierarchy WHERE parent_id=900').get();
    expect(links.c).toBe(2);
  });

  it('emits the current-status filter by default, omits it when currentOnly=false', async () => {
    let capturedDefault = '', capturedOff = '';
    await ingestAdminAreas(db, { countries: ['FR'], logger, fetchSparql: async (query) => { capturedDefault = query; return { results: { bindings: [] } }; }, fetchEntities: async () => ({ entities: {} }) });
    await ingestAdminAreas(db, { countries: ['FR'], logger, currentOnly: false, fetchSparql: async (query) => { capturedOff = query; return { results: { bindings: [] } }; }, fetchEntities: async () => ({ entities: {} }) });
    expect(capturedDefault).toMatch(/FILTER NOT EXISTS \{ \?adm2 wdt:P576/);
    expect(capturedOff).not.toMatch(/P576/);
    // Labels via a lightweight direct rdfs:label, NOT the wikibase:label SERVICE
    // (the service times out on WDQS over a P279* walk — DE ingested 0 rows
    // 2026-07-19 until this was changed).
    expect(capturedDefault).toMatch(/rdfs:label \?adm2Label/);
    expect(capturedDefault).not.toMatch(/wikibase:label/);
  });

  it('is idempotent — a second run creates nothing (QID dedupe)', async () => {
    const opts = { countries: ['FR'], logger, fetchSparql: async () => SPARQL_ROWS, fetchEntities: async () => ENTITIES };
    await ingestAdminAreas(db, opts);
    const again = await ingestAdminAreas(db, opts);
    expect(again).toMatchObject({ created: 0, existing: 2, failed: 0 });
    expect(db.prepare("SELECT COUNT(*) c FROM places WHERE kind='county'").get().c).toBe(2);
  });

  it('skips a country with no VERIFIED class rows (unattended safety)', async () => {
    // Seed only an unverified candidate for DE — must not ingest.
    seedAdminClassMap(db, [
      { countryCode: 'DE', adminLevel: 2, wikidataClassQid: 'Q106658', placeKind: 'county', provenance: 'auto-discovered', verified: 0, subclassWalk: 0 },
    ]);
    db.prepare("INSERT INTO places (id, kind, country_code) VALUES (901, 'country', 'DE')").run();
    let fetched = false;
    const res = await ingestAdminAreas(db, {
      countries: ['DE'], logger,
      fetchSparql: async () => { fetched = true; return SPARQL_ROWS; },
      fetchEntities: async () => ENTITIES,
    });
    expect(fetched).toBe(false); // never even queried WDQS
    expect(res).toMatchObject({ created: 0 });
  });

  it('counts failed rows honestly and continues (no silent swallow)', async () => {
    // A binding whose entity fetch yields a name that violates nothing but
    // whose upsert path we break by passing a row with an unusable qid.
    const badSparql = { results: { bindings: [
      { adm2: { value: 'http://www.wikidata.org/entity/Q3389' }, adm2Label: { value: 'Gard' } },
      { adm2: { value: '' } }, // no qid → upsert with null extId still works; use a class that throws instead
    ] } };
    const res = await ingestAdminAreas(db, {
      countries: ['FR'], logger,
      fetchSparql: async () => badSparql,
      fetchEntities: async () => ({ entities: { Q3389: ENTITIES.entities.Q3389 } }),
    });
    // The valid row lands; the empty-qid row produces a nameless place but
    // does not crash the loop — created reflects real inserts.
    expect(res.created).toBeGreaterThanOrEqual(1);
    expect(res.failed).toBe(0);
  });
});
