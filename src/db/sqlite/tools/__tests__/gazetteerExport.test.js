const Database = require('better-sqlite3');
const {
  iteratePlaceSources,
  iteratePlaces,
  iteratePlaceNames,
  iteratePlaceHierarchy,
  iteratePlaceExternalIds,
  safeIterateAll
} = require('../gazetteerExport');

describe('gazetteer export helpers', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
  });

  afterEach(() => {
    if (db) {
      try { db.close(); } catch (_) {}
    }
    db = null;
  });

  it('returns an empty iterable when the table is missing', () => {
    expect(Array.from(iteratePlaceSources(db))).toEqual([]);
    expect(Array.from(iteratePlaces(db))).toEqual([]);
    expect(Array.from(iteratePlaceNames(db))).toEqual([]);
    expect(Array.from(iteratePlaceHierarchy(db))).toEqual([]);
    expect(Array.from(iteratePlaceExternalIds(db))).toEqual([]);
  });

  it('iterates over rows when the table exists', () => {
    db.exec(`
      CREATE TABLE place_sources(id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE places(id INTEGER PRIMARY KEY, kind TEXT);
      CREATE TABLE place_names(id INTEGER PRIMARY KEY, place_id INTEGER, name TEXT);
      CREATE TABLE place_hierarchy(parent_id INTEGER, child_id INTEGER);
      CREATE TABLE place_external_ids(place_id INTEGER, source TEXT, ext_id TEXT);
      INSERT INTO place_sources(name) VALUES ('gazetteer');
      INSERT INTO places(kind) VALUES ('city');
      INSERT INTO place_names(place_id, name) VALUES (1, 'Dublin');
      INSERT INTO place_hierarchy(parent_id, child_id) VALUES (1, 2);
      INSERT INTO place_external_ids(place_id, source, ext_id) VALUES (1, 'test', 'abc');
    `);

    expect(Array.from(iteratePlaceSources(db))).toHaveLength(1);
    expect(Array.from(iteratePlaces(db))).toHaveLength(1);
    expect(Array.from(iteratePlaceNames(db))).toHaveLength(1);
    expect(Array.from(iteratePlaceHierarchy(db))).toHaveLength(1);
    expect(Array.from(iteratePlaceExternalIds(db))).toHaveLength(1);
  });

  it('throws for non-database inputs', () => {
    expect(() => safeIterateAll(null, 'places')).toThrow(/better-sqlite3/);
  });
});
