const { PredictiveHubDiscovery } = require('../../src/core/crawler/PredictiveHubDiscovery');
const Database = require('better-sqlite3');

const db = new Database(':memory:');

// Create gazetteer table
db.exec(`
  CREATE TABLE gazetteer (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    type TEXT NOT NULL,
    population INTEGER DEFAULT 0,
    is_capital INTEGER DEFAULT 0,
    wikidata_id TEXT
  );

  INSERT INTO gazetteer (name, slug, type, population, is_capital, wikidata_id)
  VALUES 
    ('France', 'france', 'country', 67000000, 0, 'Q142'),
    ('Germany', 'germany', 'country', 83000000, 0, 'Q183'),
    ('Spain', 'spain', 'country', 47000000, 0, 'Q29'),
    ('Italy', 'italy', 'country', 60000000, 0, 'Q38');
`);

const discovery = new PredictiveHubDiscovery({ db });

// Test URL pattern extraction
const testUrl = 'https://theguardian.com/world/france';
console.log('\n1. Testing URL:', testUrl);

const pattern = discovery._extractUrlPattern(testUrl);
console.log('2. Pattern:', JSON.stringify(pattern, null, 2));

const hubType = discovery._inferHubType(testUrl, pattern);
console.log('3. Inferred hub type:', hubType);

// Test gazetteer query directly
console.log('\n4. Testing direct gazetteer query for country-hub:');
const stmt = db.prepare(`
  SELECT name, slug FROM gazetteer WHERE type = 'country' AND slug != 'france'
`);
const rows = stmt.all();
console.log('Found rows:', rows.length);
rows.forEach(row => console.log('  -', row.name, '('+row.slug+')'));

// Test the full predictSiblingHubs flow
discovery.predictSiblingHubs('theguardian.com', testUrl, {})
  .then(predictions => {
    console.log('\n5. Predictions:', predictions.length);
    predictions.forEach(p => console.log('  -', p.url, '('+p.entity+')'));
  })
  .catch(error => {
    console.error('\nError:', error);
  })
  .finally(() => {
    db.close();
  });

