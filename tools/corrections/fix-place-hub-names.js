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
const { getAllPlaceNames } = require('../../src/db/sqlite/queries/gazetteerPlaceNames');

// Parse command line arguments
const args = process.argv.slice(2);
const applyFix = args.includes('--fix');

// Initialize database
const dbPath = path.join(__dirname, '..', '..', 'data', 'news.db');
const db = ensureDatabase(dbPath);

console.log('\n🔍 Analyzing place hub names...\n');

// Load all place names from gazetteer (includes all variations)
const allPlaceNames = getAllPlaceNames(db);
console.log(`Loaded ${allPlaceNames.size} place names from gazetteer\n`);

// Get all place hubs
const placeHubs = db.prepare(`
  SELECT id, place_slug, title, url
  FROM place_hubs
  WHERE place_slug IS NOT NULL
  AND place_slug != ''
  ORDER BY place_slug
`).all();

console.log(`Found ${placeHubs.length} place hubs to check\n`);

// Normalize function: remove spaces, hyphens, lowercase
function normalize(str) {
  return str.toLowerCase().replace(/[\s-]/g, '');
}

// Find matches and corrections
const corrections = [];

placeHubs.forEach(hub => {
  const normalizedSlug = normalize(hub.place_slug);
  
  // Check if normalized slug matches any place name
  for (const placeName of allPlaceNames) {
    const normalizedPlace = normalize(placeName);
    
    if (normalizedSlug === normalizedPlace) {
      // Found a match! Convert place name to slug format
      const correctSlug = placeName.toLowerCase().replace(/\s+/g, '-');
      
      // Only correct if different from current slug
      if (hub.place_slug !== correctSlug) {
        corrections.push({
          id: hub.id,
          currentSlug: hub.place_slug,
          correctSlug: correctSlug,
          placeName: placeName,
          url: hub.url
        });
      }
      break; // Found match, no need to check more
    }
  }
});

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
    console.log('🔧 Applying corrections...\n');
    
    const updateStmt = db.prepare(`
      UPDATE place_hubs
      SET place_slug = ?
      WHERE id = ?
    `);
    
    const updateMany = db.transaction((corrections) => {
      for (const correction of corrections) {
        updateStmt.run(correction.correctSlug, correction.id);
      }
    });
    
    try {
      updateMany(corrections);
      console.log(`✅ Successfully updated ${corrections.length} place hub${corrections.length === 1 ? '' : 's'}!\n`);
    } catch (error) {
      console.error('❌ Error applying corrections:', error.message);
      process.exit(1);
    }
  } else {
    console.log('ℹ️  Dry run mode - no changes applied.');
    console.log('   Run with --fix to apply corrections.\n');
  }
}

// Close database
db.close();
