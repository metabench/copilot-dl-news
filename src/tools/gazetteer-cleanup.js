#!/usr/bin/env node
'use strict';

/**
 * Gazetteer Cleanup Tool
 * 
 * Identifies and merges duplicate place records, backfills missing data,
 * and ensures data quality across the gazetteer.
 * 
 * Usage:
 *   node src/tools/gazetteer-cleanup.js --analyze              # Show duplicate analysis
 *   node src/tools/gazetteer-cleanup.js --merge                # Merge all duplicates
 *   node src/tools/gazetteer-cleanup.js --merge --dry-run      # Preview merges
 *   node src/tools/gazetteer-cleanup.js --backfill-qids        # Backfill wikidata_qid column
 *   node src/tools/gazetteer-cleanup.js --remove-orphans       # Remove low-quality orphan records
 *   node src/tools/gazetteer-cleanup.js --all                  # Run all cleanup operations
 */

const path = require('path');
const { ensureDb } = require('../db/sqlite/ensureDb');
const { normalizeName } = require('../db/sqlite/v1/queries/gazetteer.utils');
const { CliFormatter, COLORS, ICONS } = require('../utils/CliFormatter');

// Default paths
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/gazetteer.db');

// Initialize formatter
const fmt = new CliFormatter({ useEmojis: true });

// Parse CLI args
const args = process.argv.slice(2);
const flags = {
  analyze: args.includes('--analyze'),
  merge: args.includes('--merge'),
  dryRun: args.includes('--dry-run'),
  backfillQids: args.includes('--backfill-qids'),
  removeOrphans: args.includes('--remove-orphans'),
  all: args.includes('--all'),
  verbose: args.includes('--verbose') || args.includes('-v'),
  json: args.includes('--json'),
  countryFilter: args.find(a => a.startsWith('--country='))?.split('=')[1] || null,
  help: args.includes('--help') || args.includes('-h')
};

if (flags.help || args.length === 0) {
  console.log(`
${COLORS.bold(COLORS.cyan('🧹 Gazetteer Cleanup Tool'))}

${COLORS.bold('Usage:')}
  node src/tools/gazetteer-cleanup.js [options]

${COLORS.bold('Options:')}
  ${COLORS.cyan('--analyze')}           Show duplicate analysis without making changes
  ${COLORS.cyan('--merge')}             Merge duplicate place records
  ${COLORS.cyan('--dry-run')}           Preview changes without applying them
  ${COLORS.cyan('--backfill-qids')}     Backfill wikidata_qid column from place_external_ids
  ${COLORS.cyan('--remove-orphans')}    Remove low-quality orphan records
  ${COLORS.cyan('--all')}               Run all cleanup operations
  ${COLORS.cyan('--country=XX')}        Filter by country code (e.g., --country=GB)
  ${COLORS.cyan('--verbose, -v')}       Show detailed output
  ${COLORS.cyan('--json')}              Output results as JSON
  ${COLORS.cyan('--help, -h')}          Show this help

${COLORS.bold('Examples:')}
  ${COLORS.muted('# Analyze duplicates for all countries')}
  node src/tools/gazetteer-cleanup.js --analyze

  ${COLORS.muted('# Preview merge for Great Britain')}
  node src/tools/gazetteer-cleanup.js --merge --dry-run --country=GB

  ${COLORS.muted('# Run full cleanup')}
  node src/tools/gazetteer-cleanup.js --all
`);
  process.exit(0);
}

// Enable all operations if --all
if (flags.all) {
  flags.backfillQids = true;
  flags.merge = true;
  flags.removeOrphans = true;
}

// If no specific operation, default to analyze
if (!flags.merge && !flags.backfillQids && !flags.removeOrphans && !flags.all) {
  flags.analyze = true;
}

/**
 * Backfill wikidata_qid column from place_external_ids table
 */
function backfillWikidataQids(db, dryRun = false) {
  console.log(`\n${COLORS.bold(COLORS.cyan('🔗 Backfilling Wikidata QIDs'))}`);
  console.log(COLORS.dim('─'.repeat(40)));
  
  // Find places with Wikidata external ID but no wikidata_qid in main table
  const missingQids = db.prepare(`
    SELECT p.id, p.kind, pei.ext_id as qid,
           (SELECT name FROM place_names WHERE place_id = p.id LIMIT 1) as name
    FROM places p
    JOIN place_external_ids pei ON pei.place_id = p.id AND pei.source = 'wikidata'
    WHERE p.wikidata_qid IS NULL
  `).all();
  
  if (missingQids.length === 0) {
    console.log(`  ${COLORS.success('✓')} All places already have wikidata_qid set`);
    return { updated: 0 };
  }
  
  console.log(`  ${COLORS.info('ℹ')} Found ${COLORS.cyan(missingQids.length)} places needing backfill`);
  
  if (flags.verbose) {
    console.log('');
    for (const row of missingQids.slice(0, 10)) {
      console.log(`    ${COLORS.muted('•')} ID ${row.id}: ${row.name} (${row.kind}) → ${COLORS.info(row.qid)}`);
    }
    if (missingQids.length > 10) {
      console.log(`    ${COLORS.muted(`... and ${missingQids.length - 10} more`)}`);
    }
  }
  
  if (dryRun) {
    console.log(`\n  ${COLORS.warning('⚠')} ${COLORS.warning('[DRY RUN]')} Would update ${missingQids.length} records`);
    return { updated: 0, wouldUpdate: missingQids.length };
  }
  
  // Perform the backfill
  const result = db.prepare(`
    UPDATE places
    SET wikidata_qid = (
      SELECT ext_id FROM place_external_ids
      WHERE source = 'wikidata' AND place_id = places.id
    )
    WHERE wikidata_qid IS NULL
      AND EXISTS (
        SELECT 1 FROM place_external_ids
        WHERE source = 'wikidata' AND place_id = places.id
      )
  `).run();
  
  console.log(`  ${COLORS.success('✓')} Updated ${COLORS.cyan(result.changes)} records`);
  return { updated: result.changes };
}

/**
 * Find all duplicate place groups
 */
function findDuplicates(db, options = {}) {
  const { countryFilter = null, proximityThreshold = 0.1 } = options;
  
  // Build where clause
  const whereConditions = ['p.kind IS NOT NULL'];
  if (countryFilter) {
    whereConditions.push(`p.country_code = '${countryFilter}'`);
  }
  
  // Find duplicates by normalized name + country + kind
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
  
  const groups = db.prepare(query).all();
  
  // Enrich with place details and check proximity
  const duplicateSets = [];
  
  for (const group of groups) {
    const ids = group.ids.split(',').map(id => parseInt(id, 10));
    
    // Get full details
    const places = db.prepare(`
      SELECT
        p.id, p.lat, p.lng, p.wikidata_qid, p.population, p.source,
        (SELECT COUNT(*) FROM place_names WHERE place_id = p.id) as name_count,
        (SELECT COUNT(*) FROM place_external_ids WHERE place_id = p.id) as ext_id_count,
        json_extract(p.extra, '$.role') as role
      FROM places p
      WHERE p.id IN (${ids.join(',')})
    `).all();
    
    // Check proximity if we have coordinates
    const withCoords = places.filter(p => p.lat !== null && p.lng !== null);
    let maxDistance = null;
    
    if (withCoords.length >= 2) {
      maxDistance = 0;
      for (let i = 0; i < withCoords.length; i++) {
        for (let j = i + 1; j < withCoords.length; j++) {
          const latDiff = Math.abs(withCoords[i].lat - withCoords[j].lat);
          const lngDiff = Math.abs(withCoords[i].lng - withCoords[j].lng);
          const distance = Math.sqrt(latDiff * latDiff + lngDiff * lngDiff);
          maxDistance = Math.max(maxDistance, distance);
        }
      }
    }
    
    // Score each place for quality
    const scored = places.map(p => {
      let score = 0;
      if (p.wikidata_qid) score += 1000;
      if (p.population) score += 500;
      if (p.lat !== null && p.lng !== null) score += 200;
      score += (p.name_count || 0) * 10;
      score += (p.ext_id_count || 0) * 50;
      // Penalize restcountries source
      if (p.source === 'restcountries@v3.1') score -= 100;
      return { ...p, score };
    }).sort((a, b) => b.score - a.score);
    
    // Only include if within proximity threshold (or unknown proximity)
    if (maxDistance === null || maxDistance <= proximityThreshold) {
      duplicateSets.push({
        ...group,
        ids,
        places: scored,
        maxDistance,
        keepId: scored[0].id,
        deleteIds: ids.filter(id => id !== scored[0].id)
      });
    }
  }
  
  return duplicateSets;
}

/**
 * Analyze and display duplicate information
 */
function analyzeDuplicates(db, options = {}) {
  console.log(`\n${COLORS.bold(COLORS.cyan('🔍 Duplicate Analysis'))}`);
  console.log(COLORS.dim('─'.repeat(40)));
  
  const duplicates = findDuplicates(db, options);
  
  if (duplicates.length === 0) {
    console.log(`  ${COLORS.success('✓')} No duplicates found!`);
    return { duplicateSets: 0, totalDuplicateRecords: 0 };
  }
  
  console.log(`  ${COLORS.warning('⚠')} Found ${COLORS.cyan(duplicates.length)} duplicate sets\n`);
  
  // Summary by kind
  const byKind = {};
  for (const dup of duplicates) {
    byKind[dup.kind] = (byKind[dup.kind] || 0) + 1;
  }
  console.log(`  ${COLORS.bold('By Kind:')}`);
  for (const [kind, count] of Object.entries(byKind)) {
    const icon = kind === 'city' ? '🏙️' : kind === 'country' ? '🏳️' : kind === 'region' ? '🗺️' : '📍';
    console.log(`    ${icon} ${kind}: ${COLORS.cyan(count)} sets`);
  }
  
  // Summary by country (top 10)
  const byCountry = {};
  for (const dup of duplicates) {
    byCountry[dup.country_code] = (byCountry[dup.country_code] || 0) + 1;
  }
  const topCountries = Object.entries(byCountry)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`\n  ${COLORS.bold('Top Countries with Duplicates:')}`);
  for (const [cc, count] of topCountries) {
    console.log(`    🌍 ${cc}: ${COLORS.cyan(count)} sets`);
  }
  
  // Detailed view of first 10 (or all if verbose)
  const showCount = flags.verbose ? duplicates.length : Math.min(10, duplicates.length);
  console.log(`\n  ${COLORS.bold(`Duplicate Details (showing ${showCount}):`)}\n`);
  
  for (const dup of duplicates.slice(0, showCount)) {
    console.log(`  ${COLORS.bold(dup.example_name)} ${COLORS.muted(`(${dup.kind}, ${dup.country_code})`)} - ${COLORS.cyan(dup.count)} records`);
    console.log(`    ${COLORS.muted('Distance:')} ${dup.maxDistance !== null ? dup.maxDistance.toFixed(4) + '°' : 'unknown'}`);
    console.log(`    ${COLORS.success('Keep:')} ID ${dup.keepId}`);
    console.log(`    ${COLORS.error('Delete:')} IDs ${dup.deleteIds.join(', ')}`);
    console.log(`    ${COLORS.muted('Records:')}`);
    for (const p of dup.places) {
      const isKeep = p.id === dup.keepId;
      const markers = [];
      if (isKeep) markers.push(COLORS.success('KEEP'));
      if (p.wikidata_qid) markers.push(COLORS.info(`QID:${p.wikidata_qid}`));
      if (p.population) markers.push(`pop:${p.population.toLocaleString()}`);
      markers.push(`names:${p.name_count}`);
      markers.push(COLORS.muted(`src:${p.source}`));
      markers.push(COLORS.cyan(`score:${p.score}`));
      const prefix = isKeep ? COLORS.success('→') : COLORS.muted('•');
      console.log(`      ${prefix} ID ${p.id}: ${markers.join(', ')}`);
    }
    console.log('');
  }
  
  if (!flags.verbose && duplicates.length > 10) {
    console.log(`  ${COLORS.muted(`... and ${duplicates.length - 10} more (use --verbose to see all)`)}`);
  }
  
  const totalDuplicateRecords = duplicates.reduce((sum, d) => sum + d.deleteIds.length, 0);
  console.log(`\n  ${COLORS.bold('Summary:')} ${COLORS.cyan(duplicates.length)} duplicate sets, ${COLORS.cyan(totalDuplicateRecords)} records to merge/delete`);
  
  if (flags.json) {
    return { duplicateSets: duplicates.length, totalDuplicateRecords, duplicates };
  }
  
  return { duplicateSets: duplicates.length, totalDuplicateRecords };
}

/**
 * Merge duplicate place records
 */
function mergeDuplicates(db, options = {}) {
  const { dryRun = false, countryFilter = null } = options;
  
  console.log(`\n${COLORS.bold(COLORS.cyan('🔗 Merging Duplicates'))}`);
  console.log(COLORS.dim('─'.repeat(40)));
  
  const duplicates = findDuplicates(db, { countryFilter });
  
  if (duplicates.length === 0) {
    console.log(`  ${COLORS.success('✓')} No duplicates to merge!`);
    return { merged: 0, deleted: 0 };
  }
  
  console.log(`  ${COLORS.info('ℹ')} Found ${COLORS.cyan(duplicates.length)} duplicate sets to merge`);
  
  if (dryRun) {
    console.log(`\n  ${COLORS.warning('⚠')} ${COLORS.warning('[DRY RUN]')} Would merge:`);
    for (const dup of duplicates) {
      console.log(`    ${COLORS.muted('•')} ${dup.example_name} (${dup.kind}, ${dup.country_code}): keep ID ${COLORS.success(dup.keepId)}, delete ${COLORS.error(dup.deleteIds.join(', '))}`);
    }
    return { merged: 0, deleted: 0, wouldMerge: duplicates.length, wouldDelete: duplicates.reduce((s, d) => s + d.deleteIds.length, 0) };
  }
  
  let merged = 0;
  let deleted = 0;
  
  for (const dup of duplicates) {
    const keepId = dup.keepId;
    const deleteIds = dup.deleteIds;
    
    if (deleteIds.length === 0) continue;
    
    try {
      db.transaction(() => {
        // Merge place_names - transfer unique names to the kept record
        for (const dupId of deleteIds) {
          // Find names that don't conflict
          const uniqueNames = db.prepare(`
            SELECT n.id
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
          
          if (uniqueNames.length > 0) {
            const nameIds = uniqueNames.map(n => n.id);
            db.prepare(`
              UPDATE place_names SET place_id = ?
              WHERE id IN (${nameIds.join(',')})
            `).run(keepId);
          }
          
          // Delete remaining (conflicting) names
          db.prepare(`DELETE FROM place_names WHERE place_id = ?`).run(dupId);
        }
        
        // Transfer hierarchy relationships
        db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET child_id = ?
          WHERE child_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        db.prepare(`
          UPDATE OR IGNORE place_hierarchy SET parent_id = ?
          WHERE parent_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Delete conflicting hierarchy
        db.prepare(`
          DELETE FROM place_hierarchy
          WHERE child_id IN (${deleteIds.join(',')}) OR parent_id IN (${deleteIds.join(',')})
        `).run();
        
        // Transfer attributes
        db.prepare(`
          UPDATE OR IGNORE place_attribute_values SET place_id = ?
          WHERE place_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Delete conflicting attributes
        db.prepare(`
          DELETE FROM place_attribute_values
          WHERE place_id IN (${deleteIds.join(',')})
        `).run();
        
        // Transfer external IDs
        db.prepare(`
          UPDATE OR IGNORE place_external_ids SET place_id = ?
          WHERE place_id IN (${deleteIds.join(',')})
        `).run(keepId);
        
        // Delete conflicting external IDs
        db.prepare(`
          DELETE FROM place_external_ids
          WHERE place_id IN (${deleteIds.join(',')})
        `).run();
        
        // Update place_attributes (different table)
        try {
          db.prepare(`
            UPDATE OR IGNORE place_attributes SET place_id = ?
            WHERE place_id IN (${deleteIds.join(',')})
          `).run(keepId);
          db.prepare(`
            DELETE FROM place_attributes
            WHERE place_id IN (${deleteIds.join(',')})
          `).run();
        } catch (e) {
          // Table may not exist
        }
        
        // Delete the duplicate places
        db.prepare(`
          DELETE FROM places WHERE id IN (${deleteIds.join(',')})
        `).run();
        
        merged++;
        deleted += deleteIds.length;
      })();
      
      if (flags.verbose) {
        console.log(`    ${COLORS.success('✓')} ${dup.example_name}: kept ID ${keepId}, deleted ${deleteIds.length}`);
      }
    } catch (err) {
      console.log(`    ${COLORS.error('✖')} ${dup.example_name}: ${err.message}`);
    }
  }
  
  console.log(`\n  ${COLORS.success('✓')} Merged ${COLORS.cyan(merged)} sets, deleted ${COLORS.cyan(deleted)} records`);
  return { merged, deleted };
}

/**
 * Remove low-quality orphan records that are likely duplicates of better records
 * Criteria: no wikidata_qid, no population, only 1 name, from restcountries source
 */
function removeOrphans(db, options = {}) {
  const { dryRun = false, countryFilter = null } = options;
  
  console.log(`\n${COLORS.bold(COLORS.cyan('🧹 Removing Orphan Records'))}`);
  console.log(COLORS.dim('─'.repeat(40)));
  
  // Build where clause
  const whereConditions = [
    `p.wikidata_qid IS NULL`,
    `p.population IS NULL`,
    `p.source = 'restcountries@v3.1'`,
    `(SELECT COUNT(*) FROM place_names WHERE place_id = p.id) = 1`
  ];
  
  if (countryFilter) {
    whereConditions.push(`p.country_code = '${countryFilter}'`);
  }
  
  // Find orphans that have a better record with same normalized name
  const orphans = db.prepare(`
    SELECT 
      p.id,
      p.kind,
      p.country_code,
      pn.name,
      pn.normalized
    FROM places p
    JOIN place_names pn ON pn.place_id = p.id
    WHERE ${whereConditions.join(' AND ')}
      AND EXISTS (
        SELECT 1 FROM places p2
        JOIN place_names pn2 ON pn2.place_id = p2.id
        WHERE p2.id != p.id
          AND p2.country_code = p.country_code
          AND p2.kind = p.kind
          AND pn2.normalized = pn.normalized
          AND (p2.wikidata_qid IS NOT NULL OR p2.population IS NOT NULL OR 
               (SELECT COUNT(*) FROM place_names WHERE place_id = p2.id) > 1)
      )
  `).all();
  
  if (orphans.length === 0) {
    console.log(`  ${COLORS.success('✓')} No orphan records found`);
    return { removed: 0 };
  }
  
  console.log(`  ${COLORS.info('ℹ')} Found ${COLORS.cyan(orphans.length)} low-quality orphan records`);
  
  if (flags.verbose && orphans.length > 0) {
    console.log('');
    for (const o of orphans.slice(0, 20)) {
      console.log(`    ${COLORS.muted('•')} ID ${o.id}: ${o.name} (${o.kind}, ${o.country_code})`);
    }
    if (orphans.length > 20) {
      console.log(`    ${COLORS.muted(`... and ${orphans.length - 20} more`)}`);
    }
  }
  
  if (dryRun) {
    console.log(`\n  ${COLORS.warning('⚠')} ${COLORS.warning('[DRY RUN]')} Would remove ${orphans.length} records`);
    return { removed: 0, wouldRemove: orphans.length };
  }
  
  const orphanIds = orphans.map(o => o.id);
  
  // Delete in transaction
  db.transaction(() => {
    // Delete names first
    db.prepare(`DELETE FROM place_names WHERE place_id IN (${orphanIds.join(',')})`).run();
    
    // Delete hierarchy
    db.prepare(`DELETE FROM place_hierarchy WHERE child_id IN (${orphanIds.join(',')}) OR parent_id IN (${orphanIds.join(',')})`).run();
    
    // Delete attributes
    db.prepare(`DELETE FROM place_attribute_values WHERE place_id IN (${orphanIds.join(',')})`).run();
    try {
      db.prepare(`DELETE FROM place_attributes WHERE place_id IN (${orphanIds.join(',')})`).run();
    } catch (e) {}
    
    // Delete external IDs
    db.prepare(`DELETE FROM place_external_ids WHERE place_id IN (${orphanIds.join(',')})`).run();
    
    // Delete places
    db.prepare(`DELETE FROM places WHERE id IN (${orphanIds.join(',')})`).run();
  })();
  
  console.log(`  ${COLORS.success('✓')} Removed ${COLORS.cyan(orphanIds.length)} orphan records`);
  return { removed: orphanIds.length };
}

/**
 * Main entry point
 */
function main() {
  const dbPath = args.find(a => a.startsWith('--db='))?.split('=')[1] || DEFAULT_DB_PATH;
  
  // Header
  console.log('\n' + COLORS.bold(COLORS.cyan('╔══════════════════════════════════════════════════════════════╗')));
  console.log(COLORS.bold(COLORS.cyan('║')) + COLORS.bold('  🧹 Gazetteer Cleanup Tool                                    ') + COLORS.bold(COLORS.cyan('║')));
  console.log(COLORS.bold(COLORS.cyan('╚══════════════════════════════════════════════════════════════╝')));
  
  console.log(`\n  ${COLORS.muted('Database:')} ${dbPath}`);
  if (flags.countryFilter) {
    console.log(`  ${COLORS.muted('Country:')} ${flags.countryFilter}`);
  }
  if (flags.dryRun) {
    console.log(`  ${COLORS.warning('⚠')} ${COLORS.warning('DRY RUN MODE')} - no changes will be made`);
  }
  
  let db;
  try {
    db = ensureDb(dbPath, { fileMustExist: true });
  } catch (err) {
    console.log(`\n  ${COLORS.error('✖')} Error opening database: ${err.message}`);
    process.exit(1);
  }
  
  const results = {};
  
  try {
    // Backfill wikidata_qid first (helps with deduplication)
    if (flags.backfillQids) {
      results.backfill = backfillWikidataQids(db, flags.dryRun);
    }
    
    // Analyze or merge duplicates
    if (flags.analyze && !flags.merge) {
      results.analysis = analyzeDuplicates(db, { countryFilter: flags.countryFilter });
    }
    
    if (flags.merge) {
      results.merge = mergeDuplicates(db, { dryRun: flags.dryRun, countryFilter: flags.countryFilter });
    }
    
    // Remove orphans
    if (flags.removeOrphans) {
      results.orphans = removeOrphans(db, { dryRun: flags.dryRun, countryFilter: flags.countryFilter });
    }
    
    // Final summary
    console.log('\n');
    console.log(COLORS.accent('━'.repeat(50)));
    console.log(COLORS.bold('  CLEANUP SUMMARY'));
    console.log(COLORS.accent('━'.repeat(50)));
    
    const hasResults = results.backfill || results.analysis || results.merge || results.orphans;
    
    if (!hasResults) {
      console.log(COLORS.muted('  No operations performed.'));
    } else {
      if (results.backfill) {
        const count = results.backfill.updated || results.backfill.wouldUpdate || 0;
        const icon = count > 0 ? ICONS.success : ICONS.bullet;
        const label = flags.dryRun ? 'would backfill' : 'backfilled';
        console.log(`  ${icon} QID Backfill: ${COLORS.info(count)} records ${label}`);
      }
      
      if (results.analysis) {
        const sets = results.analysis.duplicateSets;
        const records = results.analysis.totalDuplicateRecords;
        const icon = sets > 0 ? ICONS.warning : ICONS.success;
        console.log(`  ${icon} Analysis: ${COLORS.info(sets)} duplicate sets (${COLORS.muted(records + ' records')})`);
      }
      
      if (results.merge) {
        if (flags.dryRun) {
          console.log(`  ${ICONS.info} Merge (dry-run): would merge ${COLORS.info(results.merge.wouldMerge)} sets, delete ${COLORS.warning(results.merge.wouldDelete)} records`);
        } else {
          console.log(`  ${ICONS.success} Merge: ${COLORS.success(results.merge.merged)} sets merged, ${COLORS.info(results.merge.deleted)} records deleted`);
        }
      }
      
      if (results.orphans) {
        if (flags.dryRun) {
          console.log(`  ${ICONS.info} Orphans (dry-run): would remove ${COLORS.warning(results.orphans.wouldRemove)} records`);
        } else {
          console.log(`  ${ICONS.success} Orphans: ${COLORS.success(results.orphans.removed)} records removed`);
        }
      }
    }
    
    console.log(COLORS.accent('━'.repeat(50)));
    console.log('');
    
    if (flags.json) {
      console.log(COLORS.muted('JSON Results:'));
      console.log(JSON.stringify(results, null, 2));
    }
    
  } finally {
    db.close();
  }
}

main();
