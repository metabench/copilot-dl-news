'use strict';
const { openNewsCrawlerDb } = require('../../../../../db/openNewsCrawlerDb');
const { initializeSchema } = require('../schema');
const { getTopCitiesPerCountry } = require('../queries/gazetteer.places');

function createTestDatabase() {
    const db = openNewsCrawlerDb(':memory:');
    initializeSchema(db, { verbose: false, logger: console });
    return db;
}

function insertPlace(db, { kind, countryCode, population = 0, name, adm1Code = null }) {
    const place = db.prepare(`
    INSERT INTO places (kind, country_code, adm1_code, population, status, priority_score)
    VALUES (?, ?, ?, ?, 'current', ?)
  `).run(kind, countryCode, adm1Code, population, population);

    db.prepare(`
    INSERT INTO place_names (place_id, name, is_preferred, lang)
    VALUES (?, ?, 1, 'en')
  `).run(place.lastInsertRowid, name);

    return place.lastInsertRowid;
}

describe('getTopCitiesPerCountry', () => {
    let db;

    beforeEach(() => {
        db = createTestDatabase();
    });

    afterEach(() => {
        if (db) db.close();
    });

    test('returns cities grouped by qualifying country', () => {
        // Insert a qualifying country (population >= 500K)
        insertPlace(db, { kind: 'country', countryCode: 'DE', population: 83000000, name: 'Germany' });
        // Insert cities for Germany
        insertPlace(db, { kind: 'city', countryCode: 'DE', population: 3600000, name: 'Berlin' });
        insertPlace(db, { kind: 'city', countryCode: 'DE', population: 1800000, name: 'Hamburg' });
        insertPlace(db, { kind: 'city', countryCode: 'DE', population: 1100000, name: 'Munich' });

        const results = getTopCitiesPerCountry(db, { citiesPerCountry: 2 });

        expect(results).toHaveLength(1);
        expect(results[0].countryCode).toBe('DE');
        expect(results[0].countryName).toBe('Germany');
        expect(results[0].cities).toHaveLength(2);
        // Should be ordered by population descending
        expect(results[0].cities[0].name).toBe('Berlin');
        expect(results[0].cities[1].name).toBe('Hamburg');
    });

    test('excludes microstates below population threshold', () => {
        // Qualifying country
        insertPlace(db, { kind: 'country', countryCode: 'FR', population: 67000000, name: 'France' });
        insertPlace(db, { kind: 'city', countryCode: 'FR', population: 2200000, name: 'Paris' });

        // Microstate below threshold
        insertPlace(db, { kind: 'country', countryCode: 'VA', population: 800, name: 'Vatican City' });
        insertPlace(db, { kind: 'city', countryCode: 'VA', population: 800, name: 'Vatican City Centre' });

        const results = getTopCitiesPerCountry(db, { minPopulation: 500000 });

        expect(results).toHaveLength(1);
        expect(results[0].countryCode).toBe('FR');
    });

    test('respects citiesPerCountry limit', () => {
        insertPlace(db, { kind: 'country', countryCode: 'US', population: 330000000, name: 'United States' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 8300000, name: 'New York' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 3900000, name: 'Los Angeles' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 2700000, name: 'Chicago' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 2300000, name: 'Houston' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 1600000, name: 'Phoenix' });
        insertPlace(db, { kind: 'city', countryCode: 'US', population: 1400000, name: 'Philadelphia' });

        const results = getTopCitiesPerCountry(db, { citiesPerCountry: 5 });

        expect(results).toHaveLength(1);
        expect(results[0].cities).toHaveLength(5);
        expect(results[0].cities[0].name).toBe('New York');
        expect(results[0].cities[4].name).toBe('Phoenix');
    });

    test('returns empty for countries with no cities in gazetteer', () => {
        insertPlace(db, { kind: 'country', countryCode: 'XX', population: 5000000, name: 'Testland' });
        // No cities inserted

        const results = getTopCitiesPerCountry(db);

        expect(results).toHaveLength(0);
    });

    test('returns empty array for empty database', () => {
        const results = getTopCitiesPerCountry(db);
        expect(results).toEqual([]);
    });
});
