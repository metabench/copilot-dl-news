#!/usr/bin/env node

/**
 * fix-place-hub-names.js - Normalize place hub slugs to match gazetteer names
 * 
 * Problem: Place hubs discovered with slugs like "srilanka" don't match
 * gazetteer names like "Sri Lanka", causing incorrect classification.
 * 
 * Solution: Query gazetteer for all place names, match against place_slug
 * (ignoring case, spaces, hyphens), and update place_slug to proper name.
 * 
 * Usage:
 *   node tools/corrections/fix-place-hub-names.js        # Dry run (show changes)
 *   node tools/corrections/fix-place-hub-names.js --fix  # Apply changes
 * 
 * Example fixes:
 *   "srilanka" -> "sri-lanka" (matches gazetteer "Sri Lanka")
 *   "unitedstates" -> "united-states" (matches gazetteer "United States")
 */

const path = require('path');
const { ensureDatabase } = require('../../src/db/sqlite');
const { fixPlaceHubNames } = require('../../src/db/sqlite/v1/queries/gazetteer.names');

// Parse command line arguments
const args = process.argv.slice(2);
const applyFix = args.includes('--fix');

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Analyzing place hub names...\n');

const { corrections } = fixPlaceHubNames(db, { dryRun: !applyFix });

// Display results
if (corrections.length === 0) {
  console.log('✅ No corrections needed! All place hub names are properly normalized.\n');
} else {
  console.log(`Found ${corrections.length} place hub${corrections.length === 1 ? '' : 's'} to correct:\n`);
  console.log('─'.repeat(120));

  corrections.forEach((correction, index) => {
    console.log(`${index + 1}. "${correction.currentSlug}" -> "${correction.correctSlug}" (${correction.placeName})`);
    console.log(`   ${correction.url}`);
    console.log('');
  });

  console.log('─'.repeat(120));
  console.log('');

  if (applyFix) {
    console.log(`✅ Successfully updated ${corrections.length} place hub${corrections.length === 1 ? '' : 's'}!\n`);
  } else {
    console.log('ℹ️  Dry run mode - no changes applied.');
    console.log('   Run with --fix to apply corrections.\n');
  }
}

// Close database
db.close();
