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

const { ensureDatabase } = require('../../src/db/sqlite');
const { generateCapitalExternalId } = require('../../src/db/sqlite/queries/gazetteer.deduplication');
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

// Build query to find potential duplicates
// Group by country + kind + normalized name from ANY place_name (not just canonical)
let whereConditions = ['p.kind IS NOT NULL'];
if (countryFilter) whereConditions.push(`p.country_code = '${countryFilter}'`);
if (kindFilter) whereConditions.push(`p.kind = '${kindFilter}'`);
if (roleFilter) whereConditions.push(`json_extract(p.extra, '$.role') = '${roleFilter}'`);

const query = `
  SELECT 
    p.country_code,
    p.kind,
    pn.normalized,
    MIN(pn.name) as example_name,
    GROUP_CONCAT(DISTINCT p.id) as ids,
    COUNT(DISTINCT p.id) as count
  FROM places p
  JOIN place_names pn ON p.id = pn.place_id
  WHERE ${whereConditions.join(' AND ')}
  GROUP BY p.country_code, p.kind, pn.normalized
  HAVING count > 1
  ORDER BY count DESC, p.country_code, p.kind
`;

const potentialDuplicates = db.prepare(query).all();

console.log(`Found ${potentialDuplicates.length} groups with duplicate names\n`);

if (potentialDuplicates.length === 0) {
  console.log('✓ No duplicates found by name!');
  db.close();
  process.exit(0);
}

// For each group, check if they're close enough to be the same place
const duplicateSets = [];

for (const group of potentialDuplicates) {
  const ids = group.ids.split(',').map(id => parseInt(id, 10));
  
  // Get full details for each place
  const places = db.prepare(`
    SELECT 
      id, lat, lng, wikidata_qid, population, source,
      (SELECT COUNT(*) FROM place_external_ids WHERE place_id = id) as ext_id_count
    FROM places
    WHERE id IN (${ids.join(',')})
  `).all();
  
  // Check if places are within proximity threshold
  const hasCoords = places.filter(p => p.lat !== null && p.lng !== null);
  
  if (hasCoords.length < 2) {
    // Can't check proximity without coords, group them anyway
    duplicateSets.push({ ...group, ids, places, proximity: 'unknown' });
    continue;
  }
  
  // Calculate max distance between any two places in the group
  let maxDistance = 0;
  for (let i = 0; i < hasCoords.length; i++) {
    for (let j = i + 1; j < hasCoords.length; j++) {
      const latDiff = Math.abs(hasCoords[i].lat - hasCoords[j].lat);
      const lngDiff = Math.abs(hasCoords[i].lng - hasCoords[j].lng);
      const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
      maxDistance = Math.max(maxDistance, distance);
    }
  }
  
  if (maxDistance <= proximityThreshold) {
    duplicateSets.push({ ...group, ids, places, proximity: maxDistance.toFixed(4) });
  }
}

console.log(`Found ${duplicateSets.length} duplicate sets within proximity threshold\n`);

if (duplicateSets.length === 0) {
  console.log('✓ No duplicates within proximity threshold!');
  db.close();
  process.exit(0);
}

let totalMerged = 0;
let totalDeleted = 0;

// For each duplicate set, merge to best record
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
    try {
      db.transaction(() => {
        // Merge place_names - delete duplicates that would conflict, keep unique ones
        for (const dupId of deleteIds) {
          // Find names that don't exist on keepId
          const uniqueNames = db.prepare(`
            SELECT n.*
            FROM place_names n
            WHERE n.place_id = ?
            AND NOT EXISTS (
              SELECT 1 FROM place_names n2
              WHERE n2.place_id = ?
              AND n2.normalized = n.normalized
              AND n2.lang = n.lang
              AND n2.name_kind = n.name_kind
            )
          `).all(dupId, keepId);
          
          // Update unique names to keepId
          if (uniqueNames.length > 0) {
            db.prepare(`
              UPDATE place_names SET place_id = ?
              WHERE place_id = ? AND id IN (${uniqueNames.map(n => n.id).join(',')})
            `).run(keepId, dupId);
          }
          
          // Delete remaining duplicate names
          db.prepare(`DELETE FROM place_names WHERE place_id = ?`).run(dupId);
        }
        
        // Merge place_hierarchy (update both parent and child references)
        db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET child_id = ?
          WHERE child_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET parent_id = ?
          WHERE parent_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Merge place_attribute_values
        db.prepare(`
          UPDATE OR IGNORE place_attribute_values SET place_id = ?
          WHERE place_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Merge place_external_ids
        db.prepare(`
          UPDATE OR IGNORE place_external_ids SET place_id = ?
          WHERE place_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Add external ID to prevent future duplicates (if capital)
        if (roleFilter === 'capital' && dup.example_name) {
          const extId = generateCapitalExternalId('restcountries', dup.country_code, dup.example_name);
          try {
            db.prepare(`
              INSERT OR IGNORE INTO place_external_ids(source, ext_id, place_id)
              VALUES ('restcountries', ?, ?)
            `).run(extId, keepId);
          } catch (err) {
            // Ignore duplicate errors
          }
        }
        
        // Delete duplicates
        db.prepare(`
          DELETE FROM places WHERE id IN (${deleteIds.join(',')})
        `).run();
        
        console.log(`  ✓ Merged to ${keepId}, deleted ${deleteIds.length} duplicates`);
        
        totalMerged++;
        totalDeleted += deleteIds.length;
      })();
    } catch (err) {
      console.error(`  ✗ Error merging duplicates: ${err.message}`);
    }
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
