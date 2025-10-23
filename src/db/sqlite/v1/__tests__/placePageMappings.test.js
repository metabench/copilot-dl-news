'use strict';

const Database = require('better-sqlite3');
const { initializeSchema } = require('../schema');
const {
  getCountryHubCoverage,
  upsertPlacePageMapping
} = require('../queries/placePageMappings');

function createTestDatabase() {
  const db = new Database(':memory:');
  initializeSchema(db, { verbose: false, logger: console });
  return db;
}

function insertCountry(db, { code, name, importance = 100 }) {
  const place = db.prepare(`
    INSERT INTO places (kind, country_code, status, priority_score)
    VALUES ('country', ?, 'current', ?)
  `).run(code, importance);

  db.prepare(`
    INSERT INTO place_names (place_id, name, is_preferred, lang)
    VALUES (?, ?, 1, 'en')
  `).run(place.lastInsertRowid, name);

  return place.lastInsertRowid;
}

describe('place_page_mappings queries', () => {
  let db;

  beforeEach(() => {
    db = createTestDatabase();
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  test('coverage reports all countries as missing when no mappings exist', () => {
    insertCountry(db, { code: 'US', name: 'United States', importance: 500 });

    const coverage = getCountryHubCoverage(db, 'example.com');
    expect(coverage.totalCountries).toBeGreaterThanOrEqual(1);
    expect(coverage.visited).toBe(0);
    expect(coverage.seeded).toBe(0);
    expect(coverage.missing).toBe(coverage.totalCountries);
    expect(coverage.missingCountries[0].status).toBe('unmapped');
  });

  test('coverage distinguishes between hosts and verified mappings', () => {
    const usId = insertCountry(db, { code: 'US', name: 'United States', importance: 500 });

    upsertPlacePageMapping(db, {
      placeId: usId,
      host: 'example.com',
      url: 'https://example.com/world/us',
      status: 'verified',
      verifiedAt: '2025-10-21T00:00:00Z'
    });

    const exampleCoverage = getCountryHubCoverage(db, 'example.com');
    expect(exampleCoverage.seeded).toBe(1);
    expect(exampleCoverage.visited).toBe(1);
    expect(exampleCoverage.missing).toBe(0);

    const otherCoverage = getCountryHubCoverage(db, 'other.com');
    expect(otherCoverage.seeded).toBe(0);
    expect(otherCoverage.visited).toBe(0);
    expect(otherCoverage.missing).toBe(otherCoverage.totalCountries);
  });
});
