'use strict';

const Database = require('better-sqlite3');
const { ensureGazetteer } = require('../ensureDb');
const {
  createAttributeStatements,
  recordAttribute,
  recordAttributes
} = require('../queries/gazetteer.attributes');

describe('gazetteer.attributes helpers', () => {
  let db;

  beforeEach(() => {
    db = new Database(':memory:');
    ensureGazetteer(db);
    db.prepare(`INSERT INTO places(kind, country_code, source) VALUES ('country', 'TL', 'test')`).run();
  });

  afterEach(() => {
    try {
      db.close();
    } catch (_) {
      // noop
    }
  });

  function getAttributeRows() {
    return db.prepare(`
      SELECT attr, source, value_json AS valueJson, confidence
      FROM place_attribute_values
      ORDER BY attr, source
    `).all();
  }

  test('recordAttribute stores JSON value per source', () => {
    const statements = createAttributeStatements(db);
    const placeId = 1;

    recordAttribute(statements, {
      placeId,
      attr: 'population',
      source: 'restcountries',
      value: 123456,
      confidence: 0.8
    });

    const rows = getAttributeRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      attr: 'population',
      source: 'restcountries',
      confidence: 0.8
    });
    expect(JSON.parse(rows[0].valueJson)).toBe(123456);
  });

  test('recordAttributes updates existing rows instead of duplicating', () => {
    const statements = createAttributeStatements(db);
    const placeId = 1;

    recordAttributes(statements, placeId, [
      { attr: 'population', source: 'restcountries', value: 100 },
      { attr: 'population', source: 'wikidata', value: 120 }
    ]);

    // Update same source with richer metadata
    recordAttributes(statements, placeId, [
      { attr: 'population', source: 'restcountries', value: 110, metadata: { updated: true } }
    ]);

    const rows = getAttributeRows();
    expect(rows).toHaveLength(2);
    const restRow = rows.find((row) => row.source === 'restcountries');
    expect(restRow).toBeDefined();
    expect(JSON.parse(restRow.valueJson)).toBe(110);
    expect(JSON.parse(db.prepare(`SELECT metadata FROM place_attribute_values WHERE source='restcountries'`).get().metadata)).toEqual({ updated: true });
  });
});
