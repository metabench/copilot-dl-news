#!/usr/bin/env node

/**
 * fix-duplicate-places.js - Advanced duplicate place merger with coordinate proximity matching
 * 
 * Problem: Multiple records exist for the same place due to:
 * 1. Running ingestion multiple times without deduplication
 * 2. Slight coordinate variations (51.5,-0.08 vs 51.5,-0.10)
 * 3. Missing canonical_name_id creating artificial separation
 * 
 * Strategy:
 * 1. Group places by country + kind + normalized name (from place_names, not canonical)
 * 2. Within each group, check coordinate proximity (<0.05° = ~5.5km)
 * 3. Merge records that are clearly the same place
 * 4. Choose best record (coords > wikidata > pop > external_id > lowest id)
 * 5. Merge all names, hierarchy, attributes, external IDs
 * 6. Add external ID to prevent future duplicates
 * 
 * Usage:
 *   node tools/corrections/fix-duplicate-places.js                    # Dry run (default)
 *   node tools/corrections/fix-duplicate-places.js --fix              # Apply changes
 *   node tools/corrections/fix-duplicate-places.js --kind=city        # Only cities
 *   node tools/corrections/fix-duplicate-places.js --fix --country=GB # Fix specific country
 *   node tools/corrections/fix-duplicate-places.js --role=capital     # Only capitals
 * 
 * Examples:
 *   # Preview all duplicate places
 *   node tools/corrections/fix-duplicate-places.js
 *   
 *   # Fix duplicate capital cities
 *   node tools/corrections/fix-duplicate-places.js --fix --kind=city --role=capital
 *   
 *   # Fix all duplicates in a country
 *   node tools/corrections/fix-duplicate-places.js --fix --country=GB
 */

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Duplicate Places Merger

Advanced duplicate place merger with coordinate proximity matching.

PROBLEM:
Multiple records exist for the same place due to:
- Running ingestion multiple times without deduplication
- Slight coordinate variations (51.5,-0.08 vs 51.5,-0.10)
- Missing canonical_name_id creating artificial separation

STRATEGY:
1. Group places by country + kind + normalized name
2. Check coordinate proximity (<0.05° = ~5.5km)
3. Merge records that are clearly the same place
4. Choose best record (coords > wikidata > pop > external_id > lowest id)
5. Merge all names, hierarchy, attributes, external IDs
6. Add external ID to prevent future duplicates

USAGE:
  node tools/corrections/fix-duplicate-places.js [options]

OPTIONS:
  --help, -h         Show this help message
  --fix              Apply changes (default: dry-run preview)
  --country=CODE     Filter by country code (e.g., --country=GB)
  --kind=TYPE        Filter by place kind (e.g., --kind=city)
  --role=ROLE        Filter by role (e.g., --role=capital)
  --proximity=DEG    Proximity threshold in degrees (default: 0.05)

EXAMPLES:
  node tools/corrections/fix-duplicate-places.js                    # Preview all duplicates
  node tools/corrections/fix-duplicate-places.js --fix              # Apply all fixes
  node tools/corrections/fix-duplicate-places.js --kind=city        # Only cities
  node tools/corrections/fix-duplicate-places.js --fix --country=GB # Fix UK duplicates
  node tools/corrections/fix-duplicate-places.js --role=capital     # Only capitals

SAFETY:
  - Dry-run by default - use --fix to apply changes
  - Shows detailed merge plan before applying
  - Preserves all data during merge (names, hierarchy, attributes)
`);
  process.exit(0);
}

const { ensureDatabase } = require('../../src/data/db/sqlite');
const { mergeDuplicatePlaces } = require('../../src/data/db/sqlite/v1/queries/gazetteer.deduplication');
const path = require('path');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');
const countryFilter = getArg('country', null);
const kindFilter = getArg('kind', null);
const roleFilter = getArg('role', null);
const proximityThreshold = parseFloat(getArg('proximity', '0.05')); // degrees (~5.5km at equator)

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Finding duplicate places...');
if (dryRun) console.log('(DRY RUN MODE - no changes will be made)');
console.log(`Proximity threshold: ${proximityThreshold}° (~${(proximityThreshold * 111).toFixed(1)}km)\n`);

const { duplicateSets, totalMerged, totalDeleted } = mergeDuplicatePlaces(db, {
  dryRun,
  countryFilter,
  kindFilter,
  roleFilter,
  proximityThreshold
});

console.log(`Found ${duplicateSets.length} duplicate sets within proximity threshold\n`);

if (duplicateSets.length === 0) {
  console.log('✓ No duplicates within proximity threshold!');
  db.close();
  process.exit(0);
}

// Display the duplicate sets found
for (const dup of duplicateSets) {
  const roleInfo = roleFilter ? ` (${roleFilter})` : '';
  console.log(`📍 ${dup.country_code} - ${dup.kind}${roleInfo} - ${dup.example_name || 'unnamed'}: ${dup.count} records (proximity: ${dup.proximity}°)`);

  // Score each record and choose best
  const scored = dup.places.map(p => ({
    ...p,
    score: (
      (p.lat !== null && p.lng !== null ? 1000 : 0) +
      (p.wikidata_qid ? 500 : 0) +
      (p.population ? 100 : 0) +
      (p.ext_id_count > 0 ? 50 : 0) +
      (10000 - p.id) // Prefer lower IDs (older records)
    )
  })).sort((a, b) => b.score - a.score);

  const keepId = scored[0].id;
  const deleteIds = dup.ids.filter(id => id !== keepId);

  console.log(`  Keep ID ${keepId} (coords: ${scored[0].lat ? '✓' : '✗'}, wikidata: ${scored[0].wikidata_qid ? '✓' : '✗'}, pop: ${scored[0].population ? '✓' : '✗'}, ext_ids: ${scored[0].ext_id_count})`);
  console.log(`  Delete IDs: ${deleteIds.join(', ')}`);

  if (!dryRun) {
    console.log(`  ✓ Merged to ${keepId}, deleted ${deleteIds.length} duplicates`);
  }
}

console.log(`\n${'='.repeat(60)}`);
if (dryRun) {
  console.log('DRY RUN COMPLETE');
  console.log(`Would merge ${duplicateSets.length} sets of duplicates`);
  console.log(`Would delete ${duplicateSets.reduce((sum, d) => sum + d.count - 1, 0)} duplicate records`);
  console.log('\nRun with --fix to apply changes');
} else {
  console.log('✓ DEDUPLICATION COMPLETE');
  console.log(`Merged ${totalMerged} sets of duplicates`);
  console.log(`Deleted ${totalDeleted} duplicate records`);
  console.log('\n✓ Database is now clean!');
}

// Show final count
const finalQuery = `
  SELECT COUNT(*) as count 
  FROM places p
  WHERE ${whereConditions.join(' AND ')}
`;
const finalCount = db.prepare(finalQuery).get();
console.log(`\nTotal ${kindFilter || 'places'}: ${finalCount.count}`);

db.close();

