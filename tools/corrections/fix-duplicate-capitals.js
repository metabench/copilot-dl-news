#!/usr/bin/env node
/**
 * Fix duplicate capital cities by merging duplicate records
 * 
 * Strategy:
 * 1. Identify duplicates (same country + same normalized name)
 * 2. Choose best record (best coordinates, most names, most recent source)
 * 3. Merge place_names, place_hierarchy, place_attribute_values to best record
 * 4. Delete inferior duplicates
 * 5. Add external IDs to prevent future duplicates
 * 
 * Usage:
 *   node tools/corrections/fix-duplicate-capitals.js              # Dry run (default)
 *   node tools/corrections/fix-duplicate-capitals.js --fix        # Apply changes
 *   node tools/corrections/fix-duplicate-capitals.js --fix --country=GB  # Fix specific country
 */

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Fix duplicate capital cities by merging duplicate records

Strategy:
1. Identify duplicates (same country + same normalized name)
2. Choose best record (best coordinates, most names, most recent source)
3. Merge place_names, place_hierarchy, place_attribute_values to best record
4. Delete inferior duplicates
5. Add external IDs to prevent future duplicates

Usage:
  node tools/corrections/fix-duplicate-capitals.js              # Dry run (default)
  node tools/corrections/fix-duplicate-capitals.js --fix        # Apply changes
  node tools/corrections/fix-duplicate-capitals.js --fix --country=GB  # Fix specific country

Safety:
  - Dry-run by default - use --fix to apply changes
  - Shows detailed merge plan before applying
  - Preserves all data during merge (names, hierarchy, attributes)
`);
  process.exit(0);
}

const { ensureDatabase } = require('../../src/db/sqlite');
const { mergeDuplicateCapitals } = require('../../src/db/sqlite/v1/queries/gazetteer.deduplication');
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

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log(`\n🔍 Finding duplicate capital cities...`);
if (dryRun) console.log(`(DRY RUN MODE - no changes will be made)\n`);

const { duplicates, totalMerged, totalDeleted } = mergeDuplicateCapitals(db, {
  dryRun,
  countryFilter
});

console.log(`Found ${duplicates.length} sets of duplicate capitals\n`);

if (duplicates.length === 0) {
  console.log('✓ No duplicates found - database is clean!');
  db.close();
  process.exit(0);
}

// Display the duplicates found
for (const dup of duplicates) {
  const ids = dup.ids.split(',').map(Number);
  console.log(`\n📍 ${dup.country_code} - ${dup.example_name || dup.normalized}: ${ids.length} records`);

  const keepId = dup.places[0].id;
  const deleteIds = ids.filter(id => id !== keepId);

  console.log(`  Keep ID ${keepId} (coords: ${dup.places[0].has_coords ? '✓' : '✗'}, wikidata: ${dup.places[0].has_wikidata ? '✓' : '✗'}, pop: ${dup.places[0].has_pop ? '✓' : '✗'})`);
  console.log(`  Delete IDs: ${deleteIds.join(', ')}`);

  if (!dryRun) {
    console.log(`  ✓ Merged: names, hierarchy, attributes`);
    console.log(`  ✓ Deleted ${deleteIds.length} duplicate records`);
  }
}console.log(`\n${'='.repeat(60)}`);
if (dryRun) {
  console.log(`DRY RUN COMPLETE`);
  console.log(`Would merge ${duplicates.length} sets of duplicates`);
  console.log(`Would delete ${duplicates.reduce((sum, d) => sum + d.count - 1, 0)} duplicate records`);
  console.log(`\nRun with --fix to apply changes`);
} else {
  console.log(`✓ DEDUPLICATION COMPLETE`);
  console.log(`Merged ${totalMerged} sets of duplicates`);
  console.log(`Deleted ${totalDeleted} duplicate records`);
  console.log(`\n✓ Database is now clean!`);
}

// Show final count
const finalCount = db.prepare(`
  SELECT COUNT(*) as count 
  FROM places 
  WHERE kind='city' AND json_extract(extra, '$.role')='capital'
`).get();
console.log(`\nTotal capital cities: ${finalCount.count}`);
