const fs = require('fs');
const path = require('path');
const { analyzePage } = require('../src/analysis/page-analyzer');
const { buildGazetteerMatchers } = require('../src/analysis/place-extraction');
const { ensureDatabase } = require('../src/db/sqlite');

describe('Analysis Samples', () => {
  let db;
  let gazetteer;

  beforeAll(() => {
    // Use the real database
    db = ensureDatabase();
    gazetteer = buildGazetteerMatchers(db);
  });

  afterAll(() => {
    if (db) {
      db.close();
    }
  });

  test('should identify the Guardian world page as a Planet Hub', async () => {
    const url = 'https://www.theguardian.com/world';
    const htmlPath = path.join(__dirname, 'fixtures', 'the-guardian-world.html');
    const html = fs.readFileSync(htmlPath, 'utf-8');

    // Check if a planet exists in the database, which is a prerequisite for the 'world' slug override.
    const planetCheck = db.prepare("SELECT id FROM places WHERE kind = 'planet' LIMIT 1").get();
    if (!planetCheck) {
      throw new Error("Test prerequisite failed: No 'planet' found in the database. The 'world' slug override cannot be tested.");
    }

    const { analysis, hubCandidate } = await analyzePage({
      url,
      html,
      db,
      gazetteer,
      fetchRow: {
        classification: 'nav',
        nav_links_count: 100 // Provide enough nav links to pass the hub check
      }
    });

    expect(hubCandidate).not.toBeNull();
    expect(hubCandidate.kind).toBe('place');
    expect(hubCandidate.placeKind).toBe('planet');
    expect(hubCandidate.placeLabel).toBe('Earth'); // The label is derived from the slug 'world'
    expect(analysis.kind).toBe('hub');
    expect(hubCandidate.placeSource).toBe('gazetteer-override');
  });
});
