'use strict';

const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../../src/db/openNewsCrawlerDb');
const { PredictiveHubDiscovery } = require('../../src/core/crawler/PredictiveHubDiscovery');

const {
  listPredictiveHubDiscoveryDebugCountryRows,
  seedPredictiveHubDiscoveryDebugGazetteer
} = resolveNewsCrawlerDbModule();

async function main() {
  const db = openNewsCrawlerDb(':memory:');

  try {
    seedPredictiveHubDiscoveryDebugGazetteer(db);

    const discovery = new PredictiveHubDiscovery({ db });

    const testUrl = 'https://theguardian.com/world/france';
    console.log('\n1. Testing URL:', testUrl);

    const pattern = discovery._extractUrlPattern(testUrl);
    console.log('2. Pattern:', JSON.stringify(pattern, null, 2));

    const hubType = discovery._inferHubType(testUrl, pattern);
    console.log('3. Inferred hub type:', hubType);

    console.log('\n4. Testing direct gazetteer lookup for country-hub:');
    const rows = listPredictiveHubDiscoveryDebugCountryRows(db, { excludeSlug: 'france' });
    console.log('Found rows:', rows.length);
    rows.forEach(row => console.log('  -', row.name, '(' + row.slug + ')'));

    const predictions = await discovery.predictSiblingHubs('theguardian.com', testUrl, {});
    console.log('\n5. Predictions:', predictions.length);
    predictions.forEach(p => console.log('  -', p.url, '(' + p.entity + ')'));
  } finally {
    await db.close();
  }
}

main().catch((error) => {
  console.error('\nError:', error);
  process.exitCode = 1;
});
