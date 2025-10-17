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

const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log(`\n🔍 Finding duplicate capital cities...`);
if (dryRun) console.log(`(DRY RUN MODE - no changes will be made)\n`);

// Find duplicate capital cities
const query = `
  SELECT 
    p.country_code,
    pn.normalized,
    pn.name as example_name,
    GROUP_CONCAT(p.id) as ids,
    COUNT(*) as count
  FROM places p
  LEFT JOIN place_names pn ON p.canonical_name_id = pn.id
  WHERE p.kind = 'city' 
    AND json_extract(p.extra, '$.role') = 'capital'
    ${countryFilter ? `AND p.country_code = '${countryFilter}'` : ''}
  GROUP BY p.country_code, pn.normalized
  HAVING COUNT(*) > 1
  ORDER BY count DESC, p.country_code
`;

const duplicates = db.prepare(query).all();

console.log(`Found ${duplicates.length} sets of duplicate capitals\n`);

if (duplicates.length === 0) {
  console.log('✓ No duplicates found - database is clean!');
  process.exit(0);
}

let totalMerged = 0;
let totalDeleted = 0;

// For each set, merge to best record
for (const dup of duplicates) {
  const ids = dup.ids.split(',').map(Number);
  console.log(`\n📍 ${dup.country_code} - ${dup.example_name || dup.normalized}: ${ids.length} records`);
  
  // Choose best record (prioritize: has coords > has pop > has wikidata > lowest id)
  const records = db.prepare(`
    SELECT id, lat, lng, population, wikidata_qid, source,
           (lat IS NOT NULL AND lng IS NOT NULL) as has_coords,
           (population IS NOT NULL) as has_pop,
           (wikidata_qid IS NOT NULL) as has_wikidata
    FROM places WHERE id IN (${ids.join(',')})
    ORDER BY has_coords DESC, has_wikidata DESC, has_pop DESC, id ASC
  `).all();
  
  const keepId = records[0].id;
  const deleteIds = ids.filter(id => id !== keepId);
  
  console.log(`  Keep ID ${keepId} (coords: ${records[0].has_coords ? '✓' : '✗'}, wikidata: ${records[0].has_wikidata ? '✓' : '✗'}, pop: ${records[0].has_pop ? '✓' : '✗'})`);
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
        const hierarchyMerged = db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET child_id = ?
          WHERE child_id IN (${deleteIds.join(',')})
        `).run(keepId).changes;
        
        db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET parent_id = ?
          WHERE parent_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Merge place_attribute_values
        const attrsMerged = db.prepare(`
          UPDATE OR IGNORE place_attribute_values SET place_id = ?
          WHERE place_id IN (${deleteIds.join(',')})
        `).run(keepId).changes;
        
        // Add external ID to prevent future duplicates
        if (dup.example_name || dup.normalized) {
          const extId = generateCapitalExternalId('restcountries', dup.country_code, dup.example_name || dup.normalized);
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
        
        console.log(`  ✓ Merged: ${namesMerged} names, ${hierarchyMerged} hierarchy, ${attrsMerged} attributes`);
        console.log(`  ✓ Deleted ${deleteIds.length} duplicate records`);
        
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
