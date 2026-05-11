
const { openNewsCrawlerDb } = require('../src/db/openNewsCrawlerDb');
const fs = require('fs');
const path = require('path');
const { importAlternateNames } = require('../src/services/GeoImportService');

// Setup
const DB_PATH = ':memory:';
const db = openNewsCrawlerDb(DB_PATH);
const geoImport = db.geoImport;
const TMP_DIR = path.join(__dirname, 'tmp_check_geo_alt');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
const ALT_FILE = path.join(TMP_DIR, 'alternateNames.txt');

console.log('--- Applying schema ---');
geoImport.ensureGeoImportCoreSchema();

console.log('--- Seeding data ---');
const placeId = geoImport.insertGeoImportPlace({
    kind: 'city',
    countryCode: 'GB',
    population: 9000000,
    lat: 51.5,
    lng: -0.12,
    source: 'geonames'
});
console.log(`Created place with ID: ${placeId}`);

geoImport.linkGeoImportExternalId(placeId, 'geonames', '2643743');

// Create mock alternateNames.txt
// format: alternateNameId, geonameid, isolanguage, alternateName, isPreferredName, isShortName, isColloquial, isHistoric, from, to
const lines = [
    '1\t2643743\ten\tLondon\t1\t0\t0\t0\t\t',  // Existing official? Should be added as alias if duplicate checks allow, or skipped/upserted.
    '2\t2643743\tfr\tLondres\t0\t0\t0\t0\t\t', // French
    '3\t2643743\tzn\t伦顿\t0\t0\t0\t0\t\t',    // Typo chinese (mock)
    '4\t9999999\ten\tNowhere\t0\t0\t0\t0\t\t', // Unknown place ID - should skip
    '5\t2643743\t\tThe Big Smoke\t0\t0\t1\t0\t\t', // Colloquial (und)
    '6\t2643743\tes\tLondres\t0\t0\t0\t0\t\t'  // Spanish (same name as French)
];

fs.writeFileSync(ALT_FILE, lines.join('\n'));
console.log(`Created ${ALT_FILE} `);

async function cleanup() {
    if (fs.existsSync(ALT_FILE)) fs.unlinkSync(ALT_FILE);
    if (fs.existsSync(TMP_DIR)) fs.rmdirSync(TMP_DIR);
    await db.close();
}

// Run Import
console.log('--- Running Import ---');

const import$ = importAlternateNames({
    alternateNamesFile: ALT_FILE,
    db: db,
    batchSize: 2
});

import$.on('next', (progress) => {
    // console.log(`[${progress.phase}] ${progress.message} (Processed: ${progress.current})`);
});

import$.on('error', (err) => {
    console.error('Import failed:', err);
    cleanup().finally(() => {
        process.exitCode = 1;
    });
});

import$.on('complete', async (result) => {
    console.log('--- Import Complete ---');
    console.log('Stats:', result.stats);

    const names = geoImport.listGeoImportPlaceNamesForPlace(placeId);
    console.log('\nImported Names:');
    console.table(names.map(n => ({ id: n.id, name: n.name, lang: n.lang, kind: n.name_kind, preferred: n.is_preferred })));

    // Assertions
    const londres = names.filter(n => n.name === 'Londres');
    const bigSmoke = names.find(n => n.name === 'The Big Smoke');
    
    let pass = true;
    if (londres.length < 1) { console.error('FAIL: Missing Londres'); pass = false; }
    if (!bigSmoke) { console.error('FAIL: Missing The Big Smoke'); pass = false; }
    if (bigSmoke && bigSmoke.name_kind !== 'colloquial') { console.error(`FAIL: Big smoke kind wrong: ${bigSmoke.name_kind}`); pass = false; }
    if (result.stats.skipped !== 1) { console.error(`FAIL: Skipped count wrong (expected 1, got ${result.stats.skipped})`); pass = false; }

    await cleanup();

    if (pass) {
        console.log('\n✅ Verification Passed');
    } else {
        console.error('\n❌ Verification Failed');
        process.exit(1);
    }
});
