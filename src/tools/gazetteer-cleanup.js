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
const { ensureDb } = require('../data/db/sqlite/ensureDb');
// c214 (ncdb-debt ratchet): the gazetteer table access lives in
// news-crawler-db now, so the cascade-delete order for a place has one home.
// This tool keeps its scoring policy, reporting and CLI behaviour.
const {
  normalizeName,
  listPlacesMissingWikidataQid,
  backfillWikidataQidsFromExternalIds,
  listDuplicateNameGroups,
  listPlaceQualityDetails,
  mergePlacesIntoSurvivor,
  listOrphanPlaces,
  deletePlacesCascade
} = require('news-crawler-db');
const { CliFormatter, COLORS, ICONS } = require('../shared/utils/CliFormatter');

// Default paths
const DEFAULT_DB_PATH = path.join(__dirname, '../../data/news.db');

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

// c213: was a bare module-scope `if (...) { …; process.exit(0); }`. With no
// argv (every require, including a test's) it printed help and EXITED THE
// PROCESS — requiring this file under jest killed the worker outright. That
// is why a tool with ten `DELETE FROM places` statements had no tests. It is
// a function now, called only from the CLI entry point at the bottom.
function printHelpAndExit() {
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
  const missingQids = listPlacesMissingWikidataQid(db);
  
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
  const changes = backfillWikidataQidsFromExternalIds(db);
  
  console.log(`  ${COLORS.success('✓')} Updated ${COLORS.cyan(changes)} records`);
  return { updated: changes };
}

/**
 * Find all duplicate place groups
 */
function findDuplicates(db, options = {}) {
  const { countryFilter = null, proximityThreshold = 0.1 } = options;
  
  // c214: grouping moved to news-crawler-db. The country filter is a BOUND
  // parameter there — it used to be interpolated straight from CLI input.
  const groups = listDuplicateNameGroups(db, { countryFilter });
  
  // Enrich with place details and check proximity
  const duplicateSets = [];
  
  for (const group of groups) {
    const ids = group.ids.split(',').map(id => parseInt(id, 10));
    
    // Get full details (the scoring INPUTS; the policy stays here)
    const places = listPlaceQualityDetails(db, ids);
    
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
      // c214: the entire merge transaction now lives in news-crawler-db as
      // mergePlacesIntoSurvivor — names, hierarchy, attribute values,
      // attributes, external ids, then the places themselves, in that order,
      // atomically. Named for what it is: a PRIMITIVE that takes the survivor
      // this tool picked. ncdb also has a mergeDuplicatePlaces, but that one
      // carries its OWN scoring policy (coords first, then qid) which differs
      // from this tool's (qid first, then population) — they are not
      // interchangeable, and picking between them is an owner call.
      const deletedHere = mergePlacesIntoSurvivor(db, { keepId, deleteIds });
      merged++;
      deleted += deletedHere;
      
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
  // c214: the orphan predicate (no qid, no population, restcountries
  // source, exactly one name, AND a better same-country/kind sibling to
  // defer to) moved to news-crawler-db, with the country filter BOUND
  // instead of interpolated from CLI input.
  const orphans = listOrphanPlaces(db, { countryFilter });
  
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
  // c214: the cascade-delete ORDER (names, hierarchy, attribute values,
  // attributes, external ids, then places) lives in news-crawler-db now —
  // atomic, with bound id placeholders instead of interpolation.
  deletePlacesCascade(db, orphanIds);
  
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

// c213: the pure operations are exported so they can be tested against a
// temp database. main() and the help path run ONLY when this file is the
// process entry point — previously both ran on any require, which meant
// importing this module opened the live 30GB news.db and then exited.
module.exports = {
  backfillWikidataQids,
  findDuplicates,
  analyzeDuplicates,
  mergeDuplicates,
  removeOrphans
};

if (require.main === module) {
  if (flags.help || args.length === 0) {
    printHelpAndExit();
  }
  main();
}
