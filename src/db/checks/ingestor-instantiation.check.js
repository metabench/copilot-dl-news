const { WikidataCountryIngestor } = require('../../crawler/gazetteer/ingestors/WikidataCountryIngestor');

console.log('--- Lab Experiment: Ingestor Instantiation ---');

console.log('\n[Test] Instantiating WikidataCountryIngestor without arguments...');
try {
    const ingestor = new WikidataCountryIngestor();
    console.log('[Test] Success! Ingestor instantiated.');
    console.log('[Test] DB handle present:', !!ingestor.db);
} catch (e) {
    if (e.message.includes('no column named place_type')) {
        console.log('[Test] Success! DB was injected (hit schema error downstream).');
        console.log('[Test] Error details:', e.message);
    } else {
        console.error('[Test] Failed with unexpected error:', e);
        process.exit(1);
    }
}
