/**
 * @fileoverview Tests for WikidataAdm1Ingestor dynamic fetching mode
 * 
 * Tests the new dynamic region fetching functionality that queries Wikidata
 * per country with progress tracking, caching, and comprehensive error handling.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');
const WikidataAdm1Ingestor = require('../WikidataAdm1Ingestor');
const { ensureDatabase } = require('../../../../../data/db/sqlite');

describe('WikidataAdm1Ingestor - Dynamic Mode', () => {
  let tempDbPath;
  let tempCacheDir;
  let db;

  beforeEach(() => {
    // Create temporary database
    tempDbPath = path.join(os.tmpdir(), `test-adm1-${Date.now()}.db`);
    db = ensureDatabase(tempDbPath);

    // Create temporary cache directory
    tempCacheDir = path.join(os.tmpdir(), `test-adm1-cache-${Date.now()}`);
    if (!fs.existsSync(tempCacheDir)) {
      fs.mkdirSync(tempCacheDir, { recursive: true });
    }

    // Seed test countries
    db.prepare(`
      INSERT INTO places (id, wikidata_qid, kind, country_code, lat, lng, population)
      VALUES 
        (1, 'Q38', 'country', 'IT', 41.9, 12.5, 60000000),
        (2, 'Q142', 'country', 'FR', 46.2, 2.2, 67000000),
        (3, 'Q183', 'country', 'DE', 51.2, 10.5, 83000000)
    `).run();

    db.prepare(`
      INSERT INTO place_names (place_id, name, lang, name_kind, is_preferred, is_official, source)
      VALUES 
        (1, 'Italy', 'en', 'official', 1, 1, 'wikidata'),
        (2, 'France', 'en', 'official', 1, 1, 'wikidata'),
        (3, 'Germany', 'en', 'official', 1, 1, 'wikidata')
    `).run();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
    // Cleanup temp files
    try {
      if (fs.existsSync(tempDbPath)) {
        fs.unlinkSync(tempDbPath);
      }
      if (fs.existsSync(tempCacheDir)) {
        fs.rmSync(tempCacheDir, { recursive: true, force: true });
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  describe('Constructor', () => {
    test('requires database handle', () => {
      expect(() => {
        new WikidataAdm1Ingestor({});
      }).toThrow('WikidataAdm1Ingestor requires a database handle');
    });

    test('creates instance with dynamic fetch enabled', () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir
      });

      expect(ingestor.useDynamicFetch).toBe(true);
      expect(ingestor.cacheDir).toBe(tempCacheDir);
      expect(ingestor.id).toBe('wikidata-adm1');
    });

    test('creates cache directory if it does not exist', () => {
      const newCacheDir = path.join(tempCacheDir, 'nested', 'cache');
      
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: newCacheDir,
        useCache: true
      });

      expect(fs.existsSync(newCacheDir)).toBe(true);
    });

    test('defaults to snapshot mode', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      expect(ingestor.useDynamicFetch).toBe(false);
      expect(ingestor.useSnapshot).toBe(true);
    });
  });

  describe('execute() - Dynamic Mode', () => {
    test('processes countries from database', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false  // Disable cache for test
      });

      // Mock SPARQL and Entity API
      const mockFetchSparql = jest.spyOn(ingestor, '_fetchSparql').mockResolvedValue({
        results: { bindings: [] }
      });

      const result = await ingestor.execute({});

      expect(mockFetchSparql).toHaveBeenCalled();
      expect(result).toHaveProperty('recordsProcessed');
      expect(result).toHaveProperty('recordsUpserted');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('durationMs');

      mockFetchSparql.mockRestore();
    });

    test('emits progress events during processing', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false
      });

      const progressEvents = [];
      const emitProgress = (event) => {
        progressEvents.push(event);
      };

      // Mock SPARQL
      jest.spyOn(ingestor, '_fetchSparql').mockResolvedValue({
        results: { bindings: [] }
      });

      await ingestor.execute({ emitProgress });

      expect(progressEvents.length).toBeGreaterThan(0);
      expect(progressEvents[0].phase).toBe('discovery');
      expect(progressEvents[progressEvents.length - 1].phase).toBe('complete');
    });

    test('handles abort signal', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir
      });

      const controller = new AbortController();
      controller.abort();

      await expect(ingestor.execute({ signal: controller.signal })).rejects.toThrow('aborted');
    });

    test('returns empty result when no countries found', async () => {
      // Create empty database
      const emptyDbPath = path.join(os.tmpdir(), `test-empty-${Date.now()}.db`);
      const emptyDb = ensureDatabase(emptyDbPath);

      const ingestor = new WikidataAdm1Ingestor({
        db: emptyDb,
        useDynamicFetch: true,
        cacheDir: tempCacheDir
      });

      const result = await ingestor.execute({});

      expect(result.recordsProcessed).toBe(0);
      expect(result.recordsUpserted).toBe(0);

      emptyDb.close();
      fs.unlinkSync(emptyDbPath);
    });
  });

  describe('_processRegionsForCountry()', () => {
    test('fetches regions via SPARQL for country', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false
      });

      const country = { id: 1, country_code: 'IT', wikidata_qid: 'Q38' };

      const mockSparqlResult = {
        results: {
          bindings: [
            {
              region: { value: 'http://www.wikidata.org/entity/Q1460' },
              regionLabel: { value: 'Abruzzo' },
              isoCode: { value: 'IT-65' },
              pop: { value: '1311580' },
              coord: { value: 'Point(13.9 42.35)' }
            }
          ]
        }
      };

      jest.spyOn(ingestor, '_fetchSparql').mockResolvedValue(mockSparqlResult);
      
      // Mock empty Entity API response - test just verifies SPARQL is called
      jest.spyOn(ingestor, '_fetchEntities').mockResolvedValue({ entities: {} });

      const result = await ingestor._processRegionsForCountry(country);

      expect(result.processed).toBeGreaterThan(0);
      // Can't verify upserted since Entity API returns empty
      expect(result.errors).toBeGreaterThan(0); // Will error because entity missing
    });

    test('uses cached results when available', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: true
      });

      const country = { id: 1, country_code: 'IT', wikidata_qid: 'Q38' };

      // Create cache
      const cacheData = {
        countryCode: 'IT',
        timestamp: Date.now(),
        regions: [
          {
            qid: 'Q1460',
            label: 'Abruzzo',
            labelLang: 'en',
            isoCode: 'IT-65',
            coord: { lat: 42.35, lon: 13.9 },
            population: 1311580,
            areaSqKm: null,
            wikidataAdminLevel: 4,
            capital: null,
            country: { qid: 'Q38', code: 'IT' },
            aliases: [],
            priorityScore: 650
          }
        ]
      };

      const cachePath = ingestor._getCachePath('IT');
      fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');

      const mockFetchSparql = jest.spyOn(ingestor, '_fetchSparql');

      const result = await ingestor._processRegionsForCountry(country);

      expect(mockFetchSparql).not.toHaveBeenCalled();
      expect(result.processed).toBeGreaterThan(0);
    });

    test('handles SPARQL errors gracefully by invoking fallback', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false
      });

      const country = { id: 1, country_code: 'IT', wikidata_qid: 'Q38' };

      const fetchSpy = jest.spyOn(ingestor, '_fetchSparql').mockRejectedValue(new Error('SPARQL timeout'));
      const fallbackSpy = jest
        .spyOn(ingestor, '_fallbackIngestRegions')
        .mockResolvedValue({ processed: 3, upserted: 3, errors: 0 });

      const result = await ingestor._processRegionsForCountry(country);

      expect(fetchSpy).toHaveBeenCalled();
      expect(fallbackSpy).toHaveBeenCalledTimes(1);
      expect(result.processed).toBe(3);
      expect(result.upserted).toBe(3);
      expect(result.errors).toBe(0);

      fetchSpy.mockRestore();
      fallbackSpy.mockRestore();
    });

    test('includes constituent country classes in SPARQL query', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false
      });

      const country = { id: 4, country_code: 'GB', wikidata_qid: 'Q145' };

      const fetchSpy = jest.spyOn(ingestor, '_fetchSparql').mockResolvedValue({
        results: { bindings: [] }
      });
      const entitiesSpy = jest.spyOn(ingestor, '_fetchEntities').mockResolvedValue({ entities: {} });

      await ingestor._processRegionsForCountry(country);

      expect(fetchSpy).toHaveBeenCalled();
      const query = fetchSpy.mock.calls[0][0];
      expect(query).toContain('wd:Q10864048');
      expect(query).toContain('wd:Q15284');
      expect(query).toContain('wd:Q3336843');

      fetchSpy.mockRestore();
      entitiesSpy.mockRestore();
    });
  });

  describe('_upsertRegion()', () => {
    test('stores official and alias names, sets canonical name, and writes metadata', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      const entry = {
        qid: 'QTEST1',
        label: 'Test Region',
        labelLang: 'en',
        isoCode: 'IT-TR',
        coord: { lat: 40.1, lon: 12.5 },
        population: 123456,
        areaSqKm: 789,
  wikidataAdminLevel: 7,
        capital: null,
        country: { qid: 'Q38', code: 'IT' },
        aliases: [
          { text: 'Provincia Test', lang: 'it' }
        ],
        priorityScore: 700
      };

      const result = ingestor._upsertRegion(entry);

      expect(result).toHaveProperty('placeId');

      const names = db
        .prepare(`SELECT name, lang, name_kind FROM place_names WHERE place_id = ? ORDER BY id`)
        .all(result.placeId);

      expect(names.some(row => row.name === 'Test Region' && row.lang === 'en' && row.name_kind === 'official')).toBe(true);
      expect(names.some(row => row.name === 'Provincia Test' && row.lang === 'it' && row.name_kind === 'alias')).toBe(true);

      const canonical = db
        .prepare('SELECT canonical_name_id FROM places WHERE id = ?')
        .get(result.placeId);

      expect(canonical.canonical_name_id).not.toBeNull();

      const placeRow = db
        .prepare('SELECT wikidata_admin_level, extra FROM places WHERE id = ?')
        .get(result.placeId);

      expect(placeRow.wikidata_admin_level).toBe(7);

      const extra = JSON.parse(placeRow.extra);
      expect(extra).toMatchObject({ wikidataAdminLevel: 7, level: 7, isoCode: 'IT-TR' });
    });
  });

  describe('SPARQL and Entity API', () => {
    test('_fetchSparql() sends valid query', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        timeoutMs: 5000
      });

      const sparql = 'SELECT ?region WHERE { ?region wdt:P31 wd:Q10864048. } LIMIT 1';

      // This is a real API call - skip in CI unless explicitly enabled
      if (process.env.TEST_WIKIDATA_API !== '1') {
        return;
      }

      const result = await ingestor._fetchSparql(sparql);

      expect(result).toHaveProperty('results');
      expect(result.results).toHaveProperty('bindings');
      expect(Array.isArray(result.results.bindings)).toBe(true);
    }, 10000);

    test('_fetchEntities() batches requests correctly', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        timeoutMs: 5000
      });

      // Test with 55 QIDs (should create 2 batches: 50 + 5)
      const qids = Array.from({ length: 55 }, (_, i) => `Q${1000 + i}`);

      // Skip real API call in tests
      if (process.env.TEST_WIKIDATA_API !== '1') {
        return;
      }

      const result = await ingestor._fetchEntities(qids);

      expect(result).toHaveProperty('entities');
      expect(typeof result.entities).toBe('object');
    }, 15000);

    test('_extractQid() parses Wikidata URLs', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      expect(ingestor._extractQid('http://www.wikidata.org/entity/Q1460')).toBe('Q1460');
      expect(ingestor._extractQid('http://www.wikidata.org/entity/Q38')).toBe('Q38');
      expect(ingestor._extractQid('invalid')).toBeNull();
      expect(ingestor._extractQid(null)).toBeNull();
    });

    test('_extractCoordinates() parses claim coordinates', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      const claims = {
        P625: [{
          mainsnak: {
            datavalue: {
              value: {
                latitude: 42.35,
                longitude: 13.9
              }
            }
          }
        }]
      };

      const coord = ingestor._extractCoordinates(claims);

      expect(coord).toEqual({ lat: 42.35, lon: 13.9 });
    });

    test('_extractPopulation() parses population claims', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      const claims = {
        P1082: [{
          mainsnak: {
            datavalue: {
              value: { amount: 1311580 }
            }
          }
        }]
      };

      const pop = ingestor._extractPopulation(claims);

      expect(pop).toBe(1311580);
    });
  });

  describe('Cache Management', () => {
    test('_getCachePath() generates consistent paths', () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        cacheDir: tempCacheDir
      });

      const path1 = ingestor._getCachePath('IT');
      const path2 = ingestor._getCachePath('IT');

      expect(path1).toBe(path2);
      expect(path1).toContain('adm1-it');
    });

    test('_cacheRegions() writes cache file', () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        cacheDir: tempCacheDir,
        useCache: true
      });

      const regions = [
        {
          qid: 'Q1460',
          label: 'Abruzzo',
          isoCode: 'IT-65',
          population: 1311580
        }
      ];

      ingestor._cacheRegions('IT', regions);

      const cachePath = ingestor._getCachePath('IT');
      expect(fs.existsSync(cachePath)).toBe(true);

      const cached = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
      expect(cached.countryCode).toBe('IT');
      expect(cached.regions).toHaveLength(1);
    });

    test('_getCachedRegions() returns null for expired cache', () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        cacheDir: tempCacheDir,
        useCache: true
      });

      // Create expired cache (31 days old)
      const expiredTimestamp = Date.now() - (31 * 24 * 60 * 60 * 1000);
      const cacheData = {
        countryCode: 'IT',
        timestamp: expiredTimestamp,
        regions: [{ qid: 'Q1460' }]
      };

      const cachePath = ingestor._getCachePath('IT');
      fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');

      const result = ingestor._getCachedRegions('IT');

      expect(result).toBeNull();
    });

    test('_getCachedRegions() returns data for fresh cache', () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        cacheDir: tempCacheDir,
        useCache: true
      });

      const cacheData = {
        countryCode: 'IT',
        timestamp: Date.now(),
        regions: [{ qid: 'Q1460', label: 'Abruzzo' }]
      };

      const cachePath = ingestor._getCachePath('IT');
      fs.writeFileSync(cachePath, JSON.stringify(cacheData), 'utf8');

      const result = ingestor._getCachedRegions('IT');

      expect(result).toHaveLength(1);
      expect(result[0].qid).toBe('Q1460');
    });
  });

  describe('Data Extraction', () => {
    test('_extractRegionData() builds complete region object', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      const entity = {
        labels: { en: { value: 'Abruzzo' } },
        aliases: { en: [{ value: 'Abruzzi' }] },
        claims: {
          P300: [{ mainsnak: { datavalue: { value: 'IT-65' } } }],
          P1082: [{ mainsnak: { datavalue: { value: { amount: 1311580 } } } }],
          P2046: [{ mainsnak: { datavalue: { value: { amount: 10763 } } } }],
          P625: [{
            mainsnak: {
              datavalue: {
                value: { latitude: 42.35, longitude: 13.9 }
              }
            }
          }]
        }
      };

      const sparqlBinding = {
        region: { value: 'http://www.wikidata.org/entity/Q1460' },
        regionLabel: { value: 'Abruzzo' },
        isoCode: { value: 'IT-65' },
        pop: { value: '1311580' },
        coord: { value: 'Point(13.9 42.35)' }
      };

      const country = { id: 1, country_code: 'IT', wikidata_qid: 'Q38' };

      const regionData = ingestor._extractRegionData('Q1460', entity, sparqlBinding, country);

      expect(regionData.qid).toBe('Q1460');
      expect(regionData.label).toBe('Abruzzo');
      expect(regionData.isoCode).toBe('IT-65');
      expect(regionData.population).toBe(1311580);
      expect(regionData.areaSqKm).toBe(10763);
      expect(regionData.coord).toEqual({ lat: 42.35, lon: 13.9 });
      expect(regionData.aliases).toHaveLength(1);
      expect(regionData.country.code).toBe('IT');
    });

    test('_buildAttributesFromDynamic() creates proper attributes', () => {
      const ingestor = new WikidataAdm1Ingestor({ db });

      const regionData = {
        isoCode: 'IT-65',
        population: 1311580,
        areaSqKm: 10763,
        capital: 'Q3476',
        coord: { lat: 42.35, lon: 13.9 }
      };

      const attributes = ingestor._buildAttributesFromDynamic(regionData);

      expect(attributes).toHaveLength(5);
      expect(attributes.find(a => a.attr === 'iso.subdivision')).toBeDefined();
      expect(attributes.find(a => a.attr === 'population')?.value).toBe(1311580);
      expect(attributes.find(a => a.attr === 'area_sq_km')?.value).toBe(10763);
      expect(attributes.find(a => a.attr === 'capital')?.value).toBe('Q3476');
      expect(attributes.find(a => a.attr === 'coordinates')).toBeDefined();
    });
  });

  describe('Integration - Snapshot vs Dynamic', () => {
    test('snapshot mode processes from file', async () => {
      // Create temporary snapshot file
      const snapshotPath = path.join(tempCacheDir, 'snapshot.json');
      const snapshotData = [
        {
          qid: 'Q1460',
          label: 'Abruzzo',
          isoCode: 'IT-65',
          population: 1311580,
          country: { qid: 'Q38', code: 'IT' },
          aliases: []
        }
      ];
      fs.writeFileSync(snapshotPath, JSON.stringify(snapshotData), 'utf8');

      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: false,
        useSnapshot: true,
        snapshotPath
      });

      const result = await ingestor.execute({});

      expect(result.recordsProcessed).toBeGreaterThan(0);
    });

    test('dynamic mode fetches from Wikidata', async () => {
      const ingestor = new WikidataAdm1Ingestor({
        db,
        useDynamicFetch: true,
        cacheDir: tempCacheDir,
        useCache: false
      });

      // Mock API calls
      jest.spyOn(ingestor, '_fetchSparql').mockResolvedValue({
        results: { bindings: [] }
      });

      const result = await ingestor.execute({});

      expect(result).toHaveProperty('recordsProcessed');
    });
  });
});
