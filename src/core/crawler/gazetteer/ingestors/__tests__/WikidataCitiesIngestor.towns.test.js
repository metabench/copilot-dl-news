/**
 * @fileoverview A6 slice 1: kind-parameterized ingestion (towns).
 *
 * The ingestor accepts placeKind 'town' -> Q3957 discovery classes and
 * writes places.kind='town'; the default stays 'city'/Q515. The SPARQL
 * builder takes classQids so cities and towns share one query shape.
 */

'use strict';

const WikidataCitiesIngestor = require('../WikidataCitiesIngestor');
const {
  buildCitiesDiscoveryQuery,
  buildCountryClause,
  CITY_CLASS_QIDS,
  TOWN_CLASS_QIDS
} = require('../../queries/geographyQueries');
const path = require('path');
const os = require('os');
const fs = require('fs');
const { ensureDatabase } = require('../../../../../data/db/sqlite');

describe('WikidataCitiesIngestor - towns parameterization (A6)', () => {
  let tempDbPath;
  let tempCacheDir;
  let db;

  beforeEach(() => {
    tempDbPath = path.join(os.tmpdir(), `test-towns-${Date.now()}.db`);
    db = ensureDatabase(tempDbPath);
    tempCacheDir = path.join(os.tmpdir(), `test-towns-cache-${Date.now()}`);
    fs.mkdirSync(tempCacheDir, { recursive: true });

    db.prepare(`
      INSERT INTO places (id, wikidata_qid, kind, country_code, lat, lng, population)
      VALUES (1, 'Q142', 'country', 'FR', 46.2, 2.2, 68000000)
    `).run();
    db.prepare(`
      INSERT INTO place_names (place_id, name, lang, name_kind, is_preferred, is_official, source)
      VALUES (1, 'France', 'en', 'official', 1, 1, 'wikidata')
    `).run();
  });

  afterEach(() => {
    if (db) db.close();
    try {
      if (fs.existsSync(tempDbPath)) fs.unlinkSync(tempDbPath);
      if (fs.existsSync(tempCacheDir)) fs.rmSync(tempCacheDir, { recursive: true, force: true });
    } catch (_) {}
  });

  describe('buildCitiesDiscoveryQuery classQids', () => {
    const countryClause = buildCountryClause({ subjectVar: 'city', countryCode: 'FR' });

    test('defaults to the city class (Q515)', () => {
      const q = buildCitiesDiscoveryQuery({ countryClause });
      expect(q).toContain('wd:Q515');
      expect(q).not.toContain('wd:Q3957');
    });

    test('emits town classes and the population filter for towns', () => {
      const q = buildCitiesDiscoveryQuery({
        countryClause,
        classQids: TOWN_CLASS_QIDS,
        minPopulation: 5000
      });
      expect(q).toContain('wd:Q3957');
      expect(q).not.toContain('wd:Q515');
      expect(q).toContain('FILTER(?pop > 5000)');
    });
  });

  describe('placeKind wiring', () => {
    test('defaults to city/Q515', () => {
      const ingestor = new WikidataCitiesIngestor({ db, cacheDir: tempCacheDir });
      expect(ingestor.placeKind).toBe('city');
      expect(ingestor.classQids).toEqual(CITY_CLASS_QIDS);
      expect(ingestor.id).toBe('wikidata-cities');
    });

    test('town kind selects Q3957 and the towns id', () => {
      const ingestor = new WikidataCitiesIngestor({ db, cacheDir: tempCacheDir, placeKind: 'town' });
      expect(ingestor.placeKind).toBe('town');
      expect(ingestor.classQids).toEqual(TOWN_CLASS_QIDS);
      expect(ingestor.id).toBe('wikidata-towns');
    });

    test('unknown kinds fall back to city (bounded vocabulary for slice 1)', () => {
      const ingestor = new WikidataCitiesIngestor({ db, cacheDir: tempCacheDir, placeKind: 'metropolis' });
      expect(ingestor.placeKind).toBe('city');
    });

    test('_upsertCity writes places.kind from placeKind', () => {
      const ingestor = new WikidataCitiesIngestor({
        db,
        cacheDir: tempCacheDir,
        placeKind: 'town',
        minPopulation: 5000
      });

      const entity = {
        claims: {
          P1082: [{ mainsnak: { datavalue: { value: { amount: '+8500' } } } }],
          P625: [{ mainsnak: { datavalue: { value: { latitude: 48.6, longitude: 7.75 } } } }]
        },
        labels: { en: { value: 'Testville' }, fr: { value: 'Testville-sur-Mer' } },
        aliases: {}
      };
      const binding = { city: { type: 'uri', value: 'http://www.wikidata.org/entity/Q999001' } };
      const country = { id: 1, country_code: 'FR', wikidata_qid: 'Q142' };

      const upserted = ingestor._upsertCity('Q999001', entity, binding, country);
      expect(upserted).toBe(true);

      const row = db.prepare(
        "SELECT kind, country_code, population FROM places WHERE wikidata_qid = 'Q999001'"
      ).get();
      expect(row).toBeTruthy();
      expect(row.kind).toBe('town');
      expect(row.country_code).toBe('FR');
      expect(row.population).toBe(8500);
    });
  });
});
