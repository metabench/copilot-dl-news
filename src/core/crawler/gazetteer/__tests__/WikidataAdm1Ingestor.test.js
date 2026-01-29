'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const Database = require('better-sqlite3');
const { initGazetteerTables } = require('../../../../data/db/sqlite/schema');
const WikidataAdm1Ingestor = require('../ingestors/WikidataAdm1Ingestor');

function createSnapshot(entries) {
  const filePath = path.join(os.tmpdir(), `wikidata-adm1-test-${Date.now()}.json`);
  fs.writeFileSync(filePath, JSON.stringify(entries, null, 2));
  return filePath;
}

describe('WikidataAdm1Ingestor', () => {
  let db;
  let snapshotPath;
  const logger = {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
  };

  beforeEach(() => {
    db = new Database(':memory:');
    initGazetteerTables(db, { verbose: false, logger: console });

    db.prepare(`
      INSERT INTO places(kind, country_code, wikidata_qid, priority_score)
      VALUES ('country', 'US', 'Q30', 1000),
             ('country', 'CA', 'Q16', 1000)
    `).run();

    snapshotPath = createSnapshot([
      {
        qid: 'Q99',
        label: 'California',
        labelLang: 'en',
        isoCode: 'US-CA',
        population: 39538223,
        areaSqKm: 423967,
        coord: { lat: 36.7783, lon: -119.4179 },
        capital: 'Sacramento',
        aliases: [{ text: 'State of California', lang: 'en' }],
        country: { qid: 'Q30', code: 'US', label: 'United States' }
      },
      {
        qid: 'Q1904',
        label: 'Ontario',
        labelLang: 'en',
        isoCode: 'CA-ON',
        population: 14711827,
        areaSqKm: 1076395,
        coord: { lat: 51.2538, lon: -85.3232 },
        capital: 'Toronto',
        aliases: [{ text: 'Province of Ontario', lang: 'en' }],
        country: { qid: 'Q16', code: 'CA', label: 'Canada' }
      }
    ]);
  });

  afterEach(() => {
    try {
      db.close();
    } catch (_) {
      // ignore close errors
    }
    if (snapshotPath && fs.existsSync(snapshotPath)) {
      fs.unlinkSync(snapshotPath);
    }
  });

  test('ingests snapshot entries into gazetteer', async () => {
    const ingestor = new WikidataAdm1Ingestor({
      db,
      logger,
      snapshotPath
    });

    const summary = await ingestor.execute();

    expect(summary.recordsProcessed).toBe(2);
    expect(summary.recordsUpserted).toBe(2);
    expect(summary.errors).toBe(0);
    expect(summary.preview).toHaveLength(2);

    const regions = db.prepare(`
      SELECT kind, country_code, adm1_code, population, wikidata_qid, wikidata_props
      FROM places
      WHERE kind = 'region'
      ORDER BY country_code
    `).all();

    expect(regions).toHaveLength(2);
    const california = regions.find((row) => row.country_code === 'US');
    expect(california).toMatchObject({
      country_code: 'US',
      adm1_code: 'CA',
      population: 39538223,
      wikidata_qid: 'Q99'
    });

    const props = JSON.parse(california.wikidata_props);
    expect(props).toMatchObject({
      isoCode: 'US-CA',
      country: 'Q30'
    });

    const attributes = db.prepare(`
      SELECT attr, value_json
      FROM place_attribute_values
      WHERE place_id = (SELECT id FROM places WHERE wikidata_qid = 'Q99')
      ORDER BY attr
    `).all();
    expect(attributes.find((row) => row.attr === 'iso.subdivision')).toBeTruthy();
    expect(attributes.find((row) => row.attr === 'population')).toBeTruthy();

    const names = db.prepare(`
      SELECT name, lang, name_kind
      FROM place_names
      WHERE place_id = (SELECT id FROM places WHERE wikidata_qid = 'Q1904')
    `).all();
    expect(names.some((row) => row.name === 'Ontario')).toBe(true);
    expect(names.some((row) => row.name_kind === 'alias')).toBe(true);
  });
});
