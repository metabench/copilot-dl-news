#!/usr/bin/env node

/**
 * fix-canonical-names.js - Set canonical_name_id for places that have names but no canonical
 * 
 * Problem: Places have entries in place_names but canonical_name_id is NULL,
 * causing them to appear as separate entities in queries that join on canonical_name_id.
 * 
 * Solution: For each place with NULL canonical_name_id but existing names:
 * 1. Find best name (prioritize: is_official > is_preferred > English > lowest id)
 * 2. Set canonical_name_id to that name's id
 * 
 * Usage:
 *   node tools/corrections/fix-canonical-names.js              # Dry run (default)
 *   node tools/corrections/fix-canonical-names.js --fix        # Apply changes
 *   node tools/corrections/fix-canonical-names.js --kind=city  # Filter by place kind
 *   node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital
 * 
 * Examples:
 *   # Preview all places missing canonical names
 *   node tools/corrections/fix-canonical-names.js
 *   
 *   # Fix only capital cities
 *   node tools/corrections/fix-canonical-names.js --fix --kind=city --role=capital
 *   
 *   # Fix all places
 *   node tools/corrections/fix-canonical-names.js --fix
 */

// Check for help flag first
if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Canonical Names Fixer

Set canonical_name_id for places that have names but no canonical name set.

PROBLEM:
Places have entries in place_names but canonical_name_id is NULL, causing them to
appear as separate entities in queries that join on canonical_name_id.

SOLUTION:
For each place with NULL canonical_name_id but existing names:
1. Find best name (prioritize: is_official > is_preferred > English > lowest id)
2. Set canonical_name_id to that name's id

USAGE:
  node tools/corrections/fix-canonical-names.js [options]

OPTIONS:
  --help, -h         Show this help message
  --fix              Apply changes (default: dry-run preview)
  --kind=TYPE        Filter by place kind (e.g., --kind=city)
  --role=ROLE        Filter by role (e.g., --role=capital)

EXAMPLES:
  node tools/corrections/fix-canonical-names.js                    # Preview all missing canonical names
  node tools/corrections/fix-canonical-names.js --fix              # Apply all fixes
  node tools/corrections/fix-canonical-names.js --kind=city        # Only cities
  node tools/corrections/fix-canonical-names.js --fix --role=capital # Fix only capitals

SAFETY:
  - Dry-run by default - use --fix to apply changes
  - Shows detailed fix plan before applying
`);
  process.exit(0);
}

const { ensureDatabase } = require('../../src/data/db/sqlite');
const { fixCanonicalNames } = require('../../src/data/db/sqlite/v1/queries/gazetteer.names');
const path = require('path');

function getArg(name, fallback) {
  const a = process.argv.find(x => x.startsWith(`--${name}=`));
  if (!a) return fallback;
  const v = a.split('=')[1];
  return v === undefined ? fallback : v;
}

// Default to dry-run mode, require --fix to apply changes
const dryRun = !process.argv.includes('--fix');
const kindFilter = getArg('kind', null);
const roleFilter = getArg('role', null);

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Finding places with NULL canonical_name_id...');
if (dryRun) console.log('(DRY RUN MODE - no changes will be made)\n');

const { placesWithoutCanonical, fixedCount, skippedCount } = fixCanonicalNames(db, {
  dryRun,
  kindFilter,
  roleFilter
});

console.log(`Found ${placesWithoutCanonical.length} places with NULL canonical_name_id but existing names`);

if (placesWithoutCanonical.length === 0) {
  console.log('\n✓ All places have canonical names set!');
  db.close();
  process.exit(0);
}

// Display breakdown by kind
const byKind = {};
for (const place of placesWithoutCanonical) {
  byKind[place.kind] = (byKind[place.kind] || 0) + 1;
}
console.log('\nBreakdown by kind:');
for (const [kind, count] of Object.entries(byKind).sort()) {
  console.log(`  ${kind}: ${count}`);
}
console.log('');

// Prepare statement to find best name for display
const getBestName = db.prepare(`
  SELECT id, name, lang, is_official, is_preferred
  FROM place_names
  WHERE place_id = ?
  ORDER BY
    is_official DESC,
    is_preferred DESC,
    (lang = 'en') DESC,
    (lang = 'und') DESC,
    id ASC
  LIMIT 1
`);

for (const place of placesWithoutCanonical) {
  const bestName = getBestName.get(place.id);

  if (!bestName) {
    console.log(`⚠ Place ${place.id} (${place.kind}, ${place.country_code}) has no names - skipping`);
    continue;
  }

  const roleInfo = place.extra ? JSON.parse(place.extra).role : null;
  const placeDesc = `${place.kind} ${place.id} (${place.country_code}${roleInfo ? `, ${roleInfo}` : ''})`;

  if (dryRun) {
    console.log(`Would set canonical name for ${placeDesc}:`);
    console.log(`  → "${bestName.name}" (id: ${bestName.id}, lang: ${bestName.lang}, official: ${bestName.is_official ? '✓' : '✗'})`);
  } else {
    console.log(`✓ Fixed ${placeDesc} → "${bestName.name}"`);
  }
}

console.log(`\n${'='.repeat(60)}`);
if (dryRun) {
  console.log('DRY RUN COMPLETE');
  console.log(`Would fix ${placesWithoutCanonical.length - skippedCount} places`);
  if (skippedCount > 0) console.log(`Would skip ${skippedCount} places (no names available)`);
  console.log('\nRun with --fix to apply changes');
} else {
  console.log('✓ FIXES APPLIED');
  console.log(`Fixed ${fixedCount} places`);
  if (skippedCount > 0) console.log(`Skipped ${skippedCount} places`);
  console.log('\n✓ Canonical names updated!');
}

// Show summary after fix
if (!dryRun && fixedCount > 0) {
  const remaining = db.prepare(`
    SELECT COUNT(*) as count
    FROM places
    WHERE canonical_name_id IS NULL
  `).get();
  console.log(`\nRemaining places with NULL canonical_name_id: ${remaining.count}`);
}

db.close();

