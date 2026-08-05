'use strict';

/**
 * gazetteer-cleanup harness (c213).
 *
 * This tool runs ten `DELETE FROM places…` statements against the live
 * gazetteer and had NO tests, because requiring it was impossible: with no
 * argv it printed help and called process.exit(0) at module scope, which
 * kills a jest worker outright, and it exported nothing. Cycle 213 made it
 * importable (exports + a `require.main === module` entry guard) so its
 * destructive operations could finally be pinned before anyone delegates
 * their SQL into news-crawler-db.
 *
 * Schema below mirrors the real column definitions in news-crawler-db's
 * drizzle/0000_slimy_cargill.sql — the tool's queries read wikidata_qid,
 * population, source, extra->>'$.role' and the name/external-id counts, so a
 * convenient subset would not exercise them honestly.
 */

const { ensureDb } = require('../../db/ensureNewsDb');
const {
  backfillWikidataQids,
  findDuplicates,
  mergeDuplicates,
  removeOrphans
} = require('../gazetteer-cleanup');

// c213: no hand-rolled schema — ensureDb(":memory:") builds the REAL
// gazetteer tables (places, place_names, place_external_ids, hierarchy,
// attributes), so these tests exercise production column shapes.

function makeDb() {
  const db = ensureDb(':memory:');
  // ensureDb seeds one bootstrap row (id 999999, kind 'planet' — Earth).
  // Real schema is what we want; a known-empty starting point is what the
  // counts need, so clear the gazetteer tables before each test.
  for (const t of ['place_attribute_values', 'place_attributes', 'place_hierarchy', 'place_external_ids', 'place_names', 'places']) {
    db.prepare(`DELETE FROM ${t}`).run();
  }
  return db;
}

function addPlace(db, { kind = 'city', country = 'GB', name, normalized, source = 'wikidata', qid = null, population = null, lat = null, lng = null, adm1 = null } = {}) {
  const info = db.prepare(
    `INSERT INTO places (kind, country_code, adm1_code, source, wikidata_qid, population, lat, lng)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(kind, country, adm1, source, qid, population, lat, lng);
  const placeId = info.lastInsertRowid;
  db.prepare(
    `INSERT INTO place_names (place_id, name, normalized, lang, name_kind, source)
     VALUES (?, ?, ?, 'en', 'official', ?)`
  ).run(placeId, name, normalized || String(name).toLowerCase(), source);
  return placeId;
}

// The tool prints a banner per operation; keep the suite output readable.
let logSpy;
beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
afterEach(() => { logSpy.mockRestore(); });

describe('gazetteer-cleanup: importable at all', () => {
  it('exports its operations without executing the CLI', () => {
    // The regression this guards: a bare main() + module-scope
    // process.exit(0) made requiring this file fatal.
    expect(typeof backfillWikidataQids).toBe('function');
    expect(typeof findDuplicates).toBe('function');
    expect(typeof mergeDuplicates).toBe('function');
    expect(typeof removeOrphans).toBe('function');
  });
});

describe('backfillWikidataQids', () => {
  it('copies the wikidata external id into places.wikidata_qid', () => {
    const db = makeDb();
    const id = addPlace(db, { name: 'York' });
    db.prepare(`INSERT INTO place_external_ids (source, ext_id, place_id) VALUES ('wikidata', 'Q42', ?)`).run(id);

    const result = backfillWikidataQids(db, false);

    expect(result.updated).toBe(1);
    expect(db.prepare('SELECT wikidata_qid FROM places WHERE id = ?').get(id).wikidata_qid).toBe('Q42');
    db.close();
  });

  it('dry run reports the count and writes NOTHING', () => {
    const db = makeDb();
    const id = addPlace(db, { name: 'York' });
    db.prepare(`INSERT INTO place_external_ids (source, ext_id, place_id) VALUES ('wikidata', 'Q42', ?)`).run(id);

    const result = backfillWikidataQids(db, true);

    expect(result.wouldUpdate).toBe(1);
    expect(result.updated).toBe(0);
    expect(db.prepare('SELECT wikidata_qid FROM places WHERE id = ?').get(id).wikidata_qid).toBeNull();
    db.close();
  });

  it('reports zero when every place already has a qid', () => {
    const db = makeDb();
    addPlace(db, { name: 'York', qid: 'Q42' });
    expect(backfillWikidataQids(db, false).updated).toBe(0);
    db.close();
  });
});

describe('findDuplicates', () => {
  it('groups by normalized name + country + kind, and keeps the highest-scoring place', () => {
    const db = makeDb();
    // Scoring (from the subject): qid +1000, population +500, coords +200,
    // names *10, external ids *50, restcountries source -100.
    const rich = addPlace(db, { name: 'York', qid: 'Q42', population: 200000, lat: 53.9, lng: -1.08 });
    const poor = addPlace(db, { name: 'York', source: 'restcountries@v3.1' });

    const dups = findDuplicates(db);

    expect(dups).toHaveLength(1);
    expect(dups[0].count).toBe(2);
    expect(dups[0].keepId).toBe(rich);
    expect(dups[0].deleteIds).toEqual([poor]);
    db.close();
  });

  it('does not group across different countries or kinds', () => {
    const db = makeDb();
    addPlace(db, { name: 'York', country: 'GB' });
    addPlace(db, { name: 'York', country: 'US' });
    // the real schema enforces: current region rows require adm1_code
    addPlace(db, { name: 'York', country: 'GB', kind: 'region', adm1: 'YOR' });

    expect(findDuplicates(db)).toHaveLength(0);
    db.close();
  });

  it('honours the country filter', () => {
    const db = makeDb();
    addPlace(db, { name: 'York', country: 'GB' });
    addPlace(db, { name: 'York', country: 'GB' });
    addPlace(db, { name: 'Springfield', country: 'US' });
    addPlace(db, { name: 'Springfield', country: 'US' });

    expect(findDuplicates(db, { countryFilter: 'GB' })).toHaveLength(1);
    expect(findDuplicates(db)).toHaveLength(2);
    db.close();
  });
});

describe('mergeDuplicates', () => {
  it('DRY RUN deletes nothing', () => {
    const db = makeDb();
    addPlace(db, { name: 'York', qid: 'Q42' });
    addPlace(db, { name: 'York' });

    const result = mergeDuplicates(db, { dryRun: true });

    expect(result.deleted).toBe(0);
    expect(result.wouldDelete).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(2);
    db.close();
  });

  it('deletes the losers, keeps the winner, and moves its unique names across', () => {
    const db = makeDb();
    const keep = addPlace(db, { name: 'York', qid: 'Q42' });
    const drop = addPlace(db, { name: 'York' });
    // A name only the loser has — must survive the merge on the winner.
    db.prepare(
      `INSERT INTO place_names (place_id, name, normalized, lang, name_kind, source)
       VALUES (?, 'Eboracum', 'eboracum', 'la', 'historic', 'test')`
    ).run(drop);

    const result = mergeDuplicates(db, { dryRun: false });

    expect(result.deleted).toBe(1);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(1);
    expect(db.prepare('SELECT id FROM places').get().id).toBe(keep);

    const names = db.prepare('SELECT normalized FROM place_names WHERE place_id = ? ORDER BY normalized').all(keep)
      .map((r) => r.normalized);
    expect(names).toContain('eboracum');
    db.close();
  });

  it('leaves a database with no duplicates completely untouched', () => {
    const db = makeDb();
    addPlace(db, { name: 'York' });
    addPlace(db, { name: 'Leeds' });

    const result = mergeDuplicates(db, { dryRun: false });

    expect(result.deleted).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(2);
    db.close();
  });
});

describe('removeOrphans', () => {
  // The predicate, from the subject: wikidata_qid IS NULL AND population IS
  // NULL AND source = 'restcountries@v3.1' AND exactly one name — and a
  // better same-country/kind sibling must exist.
  function seedOrphanPair(db) {
    const good = addPlace(db, { name: 'York', qid: 'Q42', population: 200000 });
    const orphan = addPlace(db, { name: 'York', source: 'restcountries@v3.1' });
    return { good, orphan };
  }

  it('DRY RUN deletes nothing', () => {
    const db = makeDb();
    seedOrphanPair(db);
    const result = removeOrphans(db, { dryRun: true });
    expect(result.removed).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(2);
    db.close();
  });

  it('removes only the low-quality orphan and keeps its better sibling', () => {
    const db = makeDb();
    const { good, orphan } = seedOrphanPair(db);

    const result = removeOrphans(db, { dryRun: false });

    expect(result.removed).toBe(1);
    const remaining = db.prepare('SELECT id FROM places').all().map((r) => r.id);
    expect(remaining).toEqual([good]);
    expect(remaining).not.toContain(orphan);
    db.close();
  });

  it('spares a restcountries place that carries a qid or a population', () => {
    const db = makeDb();
    addPlace(db, { name: 'York', qid: 'Q42', population: 200000 });
    addPlace(db, { name: 'York', source: 'restcountries@v3.1', qid: 'Q99' });

    expect(removeOrphans(db, { dryRun: false }).removed).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(2);
    db.close();
  });

  it('spares an orphan that has no better sibling to defer to', () => {
    const db = makeDb();
    addPlace(db, { name: 'Lonely', source: 'restcountries@v3.1' });

    expect(removeOrphans(db, { dryRun: false }).removed).toBe(0);
    expect(db.prepare('SELECT COUNT(*) AS n FROM places').get().n).toBe(1);
    db.close();
  });
});
