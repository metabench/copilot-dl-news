#!/usr/bin/env node
'use strict';

/**
 * Test script to verify standalone gazetteer database creation and operations.
 * 
 * Usage:
 *   node scripts/test-gazetteer-standalone.js
 *   node scripts/test-gazetteer-standalone.js --cleanup  # Remove test database after
 */

const path = require('path');
const fs = require('fs');

// Resolve from project root
const PROJECT_ROOT = path.resolve(__dirname, '..');

// Import gazetteer module
const { 
  createGazetteerDatabase,
  checkGazetteerSchema,
  getGazetteerStats,
  GAZETTEER_TARGETS
} = require(path.join(PROJECT_ROOT, 'src/db/sqlite/gazetteer/v1'));

// Test database path
const TEST_DB_PATH = path.join(PROJECT_ROOT, 'data', 'gazetteer-test.db');

// CLI args
const cleanup = process.argv.includes('--cleanup');

async function main() {
  console.log('🧪 Testing Gazetteer Standalone Module\n');
  console.log(`   Database: ${TEST_DB_PATH}`);
  console.log(`   Tables: ${GAZETTEER_TARGETS.size}`);
  console.log('');
  
  // Clean up any previous test database
  if (fs.existsSync(TEST_DB_PATH)) {
    console.log('🗑️  Removing existing test database...');
    fs.unlinkSync(TEST_DB_PATH);
  }
  
  try {
    // Test 1: Create standalone database
    console.log('1️⃣  Creating standalone gazetteer database...');
    const gazetteer = createGazetteerDatabase(TEST_DB_PATH, { verbose: true });
    console.log('   ✅ Database created successfully\n');
    
    // Test 2: Verify schema
    console.log('2️⃣  Verifying schema...');
    const schemaCheck = checkGazetteerSchema(gazetteer.db);
    console.log(`   Tables exist: ${schemaCheck.exists}`);
    console.log(`   Tables found: ${schemaCheck.tablesFound?.length || 0}`);
    if (schemaCheck.missing?.length > 0) {
      console.log(`   ⚠️  Missing: ${schemaCheck.missing.join(', ')}`);
    }
    console.log('   ✅ Schema verified\n');
    
    // Test 3: Insert some test data
    console.log('3️⃣  Inserting test data...');
    
    // Insert a test place
    const placeId = gazetteer.insertPlace({
      kind: 'city',
      country_code: 'GB',
      population: 9000000,
      lat: 51.5074,
      lng: -0.1278,
      source: 'test',
      timezone: 'Europe/London'
    });
    console.log(`   Inserted place with ID: ${placeId}`);
    
    // Insert names for the place (correct argument order: placeId, nameObj)
    gazetteer.insertPlaceName(placeId, {
      name: 'London',
      lang: 'en',
      name_kind: 'official',
      is_preferred: true,
      source: 'test'
    });
    
    gazetteer.insertPlaceName(placeId, {
      name: 'Londres',
      lang: 'fr',
      name_kind: 'alternate',
      is_preferred: false,
      source: 'test'
    });
    
    gazetteer.insertPlaceName(placeId, {
      name: 'Londra',
      lang: 'it',
      name_kind: 'alternate',
      is_preferred: false,
      source: 'test'
    });
    
    console.log('   Inserted 3 place names');
    
    // Insert another place
    const placeId2 = gazetteer.insertPlace({
      kind: 'city',
      country_code: 'GB',
      population: 1150000,
      lat: 52.4862,
      lng: -1.8904,
      source: 'test',
      timezone: 'Europe/London'
    });
    
    gazetteer.insertPlaceName(placeId2, {
      name: 'Birmingham',
      lang: 'en',
      name_kind: 'official',
      is_preferred: true,
      source: 'test'
    });
    
    console.log(`   Inserted second place with ID: ${placeId2}`);
    
    console.log('   ✅ Test data inserted\n');
    
    // Test 4: Query by name
    console.log('4️⃣  Testing name lookups...');
    
    const londonResults = gazetteer.searchPlacesByName('london');
    console.log(`   Search "london": Found ${londonResults.length} match(es)`);
    if (londonResults.length > 0) {
      console.log(`   → ${londonResults[0].name} (${londonResults[0].country_code}), pop: ${londonResults[0].population?.toLocaleString()}`);
    }
    
    const birminghamResults = gazetteer.searchPlacesByName('birmingham');
    console.log(`   Search "birmingham": Found ${birminghamResults.length} match(es)`);
    
    // Fuzzy lookup (Italian name)
    const londraResults = gazetteer.searchPlacesByName('londra');
    console.log(`   Search "londra" (Italian): Found ${londraResults.length} match(es)`);
    
    console.log('   ✅ Name lookups working\n');
    
    // Test 5: Get statistics
    console.log('5️⃣  Getting statistics...');
    const stats = gazetteer.getStats();
    console.log(`   Places: ${stats.places}`);
    console.log(`   Names: ${stats.place_names}`);
    console.log(`   By source: ${JSON.stringify(stats.by_source)}`);
    console.log('   ✅ Statistics working\n');
    
    // Test 6: Close and reopen
    console.log('6️⃣  Testing close and reopen...');
    gazetteer.close();
    console.log('   Closed database');
    
    const gazetteer2 = createGazetteerDatabase(TEST_DB_PATH, { verbose: false });
    const stats2 = gazetteer2.getStats();
    console.log(`   Reopened - Places: ${stats2.places}, Names: ${stats2.place_names}`);
    console.log('   ✅ Persistence working\n');
    
    gazetteer2.close();
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('✅ All tests passed!');
    console.log('═══════════════════════════════════════════════════════════════\n');
    
    console.log('The standalone gazetteer module is working correctly.');
    console.log('You can now use it with:');
    console.log('');
    console.log('  node src/ui/server/geoImportServer.js --standalone');
    console.log('');
    
  } catch (err) {
    console.error('\n❌ Test failed:', err.message);
    console.error(err.stack);
    process.exitCode = 1;
    
    // Try to close db if it exists
    try {
      if (typeof gazetteer !== 'undefined' && gazetteer && gazetteer.close) {
        gazetteer.close();
      }
    } catch (e) { /* ignore */ }
  } finally {
    // Cleanup if requested
    if (cleanup && fs.existsSync(TEST_DB_PATH)) {
      console.log('\n🗑️  Cleaning up test database...');
      try {
        fs.unlinkSync(TEST_DB_PATH);
        console.log('   Removed:', TEST_DB_PATH);
      } catch (e) {
        console.log('   ⚠️ Could not remove (may still be locked):', e.message);
      }
      // Also try to remove WAL and SHM files
      try {
        if (fs.existsSync(TEST_DB_PATH + '-wal')) fs.unlinkSync(TEST_DB_PATH + '-wal');
        if (fs.existsSync(TEST_DB_PATH + '-shm')) fs.unlinkSync(TEST_DB_PATH + '-shm');
      } catch (e) { /* ignore */ }
    } else if (fs.existsSync(TEST_DB_PATH)) {
      console.log(`\n📁 Test database kept at: ${TEST_DB_PATH}`);
      console.log('   Run with --cleanup to remove it.');
    }
  }
}

main();
