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

const { ensureDatabase } = require('../../src/db/sqlite');
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

// Build query with optional filters
let whereConditions = ['p.canonical_name_id IS NULL'];
if (kindFilter) whereConditions.push(`p.kind = '${kindFilter}'`);
if (roleFilter) whereConditions.push(`json_extract(p.extra, '$.role') = '${roleFilter}'`);

const query = `
  SELECT 
    p.id,
    p.kind,
    p.country_code,
    p.extra,
    COUNT(pn.id) as name_count
  FROM places p
  LEFT JOIN place_names pn ON p.id = pn.place_id
  WHERE ${whereConditions.join(' AND ')}
  GROUP BY p.id
  HAVING name_count > 0
  ORDER BY p.kind, p.country_code, p.id
`;

const placesWithoutCanonical = db.prepare(query).all();

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

// Prepare statement to find best name
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

// Prepare statement to update canonical_name_id
const updateCanonical = db.prepare(`
  UPDATE places 
  SET canonical_name_id = ?
  WHERE id = ?
`);

let fixedCount = 0;
let skippedCount = 0;

for (const place of placesWithoutCanonical) {
  const bestName = getBestName.get(place.id);
  
  if (!bestName) {
    console.log(`⚠ Place ${place.id} (${place.kind}, ${place.country_code}) has no names - skipping`);
    skippedCount++;
    continue;
  }
  
  const roleInfo = place.extra ? JSON.parse(place.extra).role : null;
  const placeDesc = `${place.kind} ${place.id} (${place.country_code}${roleInfo ? `, ${roleInfo}` : ''})`;
  
  if (dryRun) {
    console.log(`Would set canonical name for ${placeDesc}:`);
    console.log(`  → "${bestName.name}" (id: ${bestName.id}, lang: ${bestName.lang}, official: ${bestName.is_official ? '✓' : '✗'})`);
  } else {
    try {
      updateCanonical.run(bestName.id, place.id);
      console.log(`✓ Fixed ${placeDesc} → "${bestName.name}"`);
      fixedCount++;
    } catch (err) {
      console.error(`✗ Error fixing ${placeDesc}: ${err.message}`);
      skippedCount++;
    }
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
