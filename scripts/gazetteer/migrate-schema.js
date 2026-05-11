#!/usr/bin/env node
const { openNewsCrawlerDb } = require('../../src/db/openNewsCrawlerDb');
/**
 * @fileoverview Gazetteer schema migration script
 * 
 * Implements the following schema changes:
 * 1. Create alias_mappings table
 * 2. Fix canonical_name_id for places that have names
 * 3. Delete places that cannot have canonical names determined
 * 4. Add indexes for performance
 * 5. Standardize place_type values (rename 'kind' to consistent values)
 * 
 * NOTE: url_slug is NOT stored in the database. It is computed at load time
 * by the PlaceLookup matching engine. This avoids redundant storage and
 * keeps the schema simpler.
 * 
 * Usage: node scripts/gazetteer/migrate-schema.js [--dry-run]
 */

const path = require('path');
const { runGazetteerSchemaMigration } = require('news-crawler-db');
const DB_PATH = path.join(__dirname, '../../data/gazetteer.db');
const isDryRun = process.argv.includes('--dry-run');

function main() {
  console.log('=== Gazetteer Schema Migration ===');
  console.log(`Database: ${DB_PATH}`);
  console.log(`Mode: ${isDryRun ? 'DRY RUN' : 'LIVE'}`);
  console.log('');

  const db = openNewsCrawlerDb(DB_PATH);
  
  try {
    // 1. Create alias_mappings table
    console.log('1. Creating alias_mappings table...');
    const report = runGazetteerSchemaMigration(db, { dryRun: isDryRun });

    if (report.aliasMappings.created) {
      console.log('   ✓ Created alias_mappings table');
    } else {
      console.log('   ⏭ alias_mappings table already exists');
    }

    // 2. Fix canonical_name_id for places that have names
    console.log('\n2. Fixing canonical_name_id...');
    console.log(`   Found ${report.canonicalNames.foundNull} places with NULL canonical_name_id`);
    for (const fix of report.canonicalNames.fixes) {
      const suffix = fix.english ? '' : ' (non-English)';
      console.log(`   ✓ Fixed place ${fix.id} (${fix.kind}): canonical = "${fix.name}"${suffix}`);
    }
    for (const deletion of report.canonicalNames.deletions) {
      console.log(`   ✗ Deleted place ${deletion.id} (${deletion.kind}) - no names found`);
    }
    console.log(`   Summary: ${report.canonicalNames.fixed} fixed, ${report.canonicalNames.deleted} deleted`);

    // 3. Verify no NULL canonical_name_id remain
    console.log('\n3. Verifying canonical_name_id integrity...');
    if (report.remainingNullCanonical === 0) {
      console.log('   ✓ All places have canonical_name_id');
    } else {
      console.log(`   ⚠ ${report.remainingNullCanonical} places still have NULL canonical_name_id`);
    }

    // 4. Add indexes
    console.log('\n4. Adding indexes...');
    for (const idx of report.indexes) {
      if (idx.created) {
        console.log(`   ✓ Created ${idx.name}`);
      } else {
        console.log(`   ⏭ ${idx.name} already exists`);
      }
    }

    // 5. Add place_type column (standardized from kind)
    console.log('\n5. Adding place_type column...');
    if (report.placeType.added) {
      console.log('   ✓ Added place_type column');
      console.log(`   ✓ Populated place_type for ${report.placeType.populated} places`);
    } else {
      console.log('   ⏭ place_type column already exists');
    }

    // Commit
    if (!isDryRun) {
      console.log('\n✓ Migration completed successfully!');
    } else {
      console.log('\n✓ Dry run completed - no changes made');
    }

    // Summary stats
    console.log('\n=== Final Statistics ===');
    const stats = report.stats;
    console.log(`Places: ${stats.places}`);
    console.log(`Place names: ${stats.place_names}`);
    if (!isDryRun) {
      console.log(`Alias mappings: ${stats.alias_count}`);
    }
    console.log('\nNote: URL slugs are computed at runtime by PlaceLookup, not stored in DB.');

  } catch (err) {
    console.error('\n✗ Migration failed:', err.message);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
