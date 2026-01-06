
const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const { applySchema } = require('../src/db/sqlite/v1/schema-definitions');
const { importAlternateNames } = require('../src/services/GeoImportService');

// Setup
const DB_PATH = ':memory:';
const db = new Database(DB_PATH);
const TMP_DIR = path.join(__dirname, 'tmp_check_geo_alt');

if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR);
const ALT_FILE = path.join(TMP_DIR, 'alternateNames.txt');

// Apply schema
console.log('--- Applying schema ---');
applySchema(db);

// Seed Data
console.log('--- Seeding data ---');
// Create a place: London
db.prepare(`
    INSERT INTO places (kind, country_code, population, lat, lng, source)
    VALUES ('city', 'GB', 9000000, 51.5, -0.12, 'geonames')
`).run();
const placeId = db.prepare('SELECT last_insert_rowid() as id FROM places').get().id;
console.log(`Created place with ID: ${placeId}`);

// Link it to geoname ID '2643743' (London)
db.prepare(`
    INSERT INTO place_external_ids (place_id, source, ext_id)
    VALUES (?, 'geonames', '2643743')
`).run(placeId);

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
    process.exit(1);
});

import$.on('complete', (result) => {
    console.log('--- Import Complete ---');
    console.log('Stats:', result.stats);

    // Verify
    const names = db.prepare('SELECT * FROM place_names WHERE place_id = ?').all(placeId);
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

    // Cleanup
    fs.unlinkSync(ALT_FILE);
    fs.rmdirSync(TMP_DIR);

    if (pass) {
        console.log('\n✅ Verification Passed');
    } else {
        console.error('\n❌ Verification Failed');
        process.exit(1);
    }
});
