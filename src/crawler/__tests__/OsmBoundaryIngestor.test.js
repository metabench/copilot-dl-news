'use strict';

const Database = require('better-sqlite3');
const { initGazetteerTables } = require('../../db/sqlite/schema');
const OsmBoundaryIngestor = require('../gazetteer/ingestors/OsmBoundaryIngestor');

describe('OsmBoundaryIngestor', () => {
  let db;
  let logger;

  beforeEach(() => {
    db = new Database(':memory:');
    initGazetteerTables(db, { verbose: false, logger: console });
    logger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    };

    db.prepare(`
      INSERT INTO places(kind, country_code, source, osm_type, osm_id, priority_score)
      VALUES('country', 'TL', 'fixture', 'relation', '12345', 100)
    `).run();
  });

  afterEach(() => {
    try {
      db.close();
    } catch (_) {
      // noop
    }
  });

  test('stores overpass metadata and fills missing geometry', async () => {
    const overpassResponse = {
      elements: [
        {
          type: 'relation',
          id: 12345,
          bounds: { minlat: 1.1, minlon: 2.2, maxlat: 3.3, maxlon: 4.4 },
          tags: {
            name: 'Testland',
            boundary: 'administrative',
            admin_level: '2'
          }
        },
        {
          type: 'way',
          id: 678,
          geometry: [
            { lat: 1.1, lon: 2.2 },
            { lat: 3.3, lon: 4.4 }
          ]
        }
      ]
    };

    const client = {
      fetchOverpass: jest.fn().mockResolvedValue(overpassResponse)
    };

    const ingestor = new OsmBoundaryIngestor({ db, client, logger, batchSize: 5 });

    const summary = await ingestor.execute();

    expect(summary.recordsProcessed).toBe(1);
    expect(summary.recordsUpserted).toBe(1);
    expect(client.fetchOverpass).toHaveBeenCalledTimes(1);
    const queryArg = client.fetchOverpass.mock.calls[0][0];
    expect(queryArg).toContain('relation(12345)');

    const placeRow = db.prepare('SELECT bbox, osm_tags FROM places WHERE id = 1').get();
    expect(JSON.parse(placeRow.bbox)).toEqual([2.2, 1.1, 4.4, 3.3]);
    expect(JSON.parse(placeRow.osm_tags)).toMatchObject({
      name: 'Testland',
      boundary: 'administrative'
    });

    const attributeRows = db.prepare(`
      SELECT attr, source FROM place_attribute_values WHERE place_id = 1 ORDER BY attr
    `).all();
    expect(attributeRows.map((row) => row.attr)).toEqual([
      'osm.boundary.bbox',
      'osm.boundary.overpass',
      'osm.tags'
    ]);
    expect(attributeRows.every((row) => row.source === 'osm.overpass')).toBe(true);
  });
});
