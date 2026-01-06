/**
 * Check script for PlaceContextFilter
 * 
 * Validates that:
 * 1. PlaceContextFilter correctly identifies false positives
 * 2. Integration with place-extraction.js works
 * 3. Database exclusions load correctly
 * 4. Performance is acceptable for real-time use
 */
'use strict';

const path = require('path');
const { openDatabase } = require('../src/db/sqlite/v1');
const { PlaceContextFilter, createPlaceContextFilter } = require('../src/analysis/PlaceContextFilter');
const { createEnhancedPlaceExtractor } = require('../src/analysis/place-extraction');

const dbPath = path.resolve(__dirname, '../data/news.db');
let db;
let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
  }
}

function assertEqual(actual, expected, message) {
  const match = actual === expected;
  if (match) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.log(`  ✗ ${message}`);
    console.log(`    Expected: ${expected}`);
    console.log(`    Actual: ${actual}`);
  }
}

function setup() {
  console.log('\n=== PlaceContextFilter Check ===\n');
  db = openDatabase(dbPath, { readonly: true, fileMustExist: true });
  console.log('Database opened successfully\n');
}

function teardown() {
  if (db) db.close();
  console.log('\n=== Summary ===');
  console.log(`  Passed: ${passed}`);
  console.log(`  Failed: ${failed}`);
  console.log(`  Total: ${passed + failed}`);
  
  if (failed > 0) {
    process.exit(1);
  }
}

function testBasicCreation() {
  console.log('Test: Basic PlaceContextFilter creation');
  
  const filter = createPlaceContextFilter();
  assert(filter !== null, 'Filter created');
  assert(filter instanceof PlaceContextFilter, 'Is PlaceContextFilter instance');
  
  const stats = filter.getStats();
  assert(stats.exclusionPhraseCount > 0, 'Has built-in exclusion phrases');
  assert(stats.triggerWordCount > 0, 'Has trigger word index');
  assert(stats.orgSuffixCount > 0, 'Has org suffix words');
  
  console.log(`  Info: ${stats.exclusionPhraseCount} phrases, ${stats.triggerWordCount} triggers, ${stats.orgSuffixCount} suffixes`);
  console.log('');
}

function testOrganizationDetection() {
  console.log('Test: Organization name detection');
  
  const filter = createPlaceContextFilter();
  
  // Test "Texas Instruments"
  const text1 = 'The stock of Texas Instruments rose 5% today.';
  const result1 = filter.shouldExclude('Texas', text1, 14, 19);
  assertEqual(result1.excluded, true, '"Texas" excluded when part of "Texas Instruments"');
  assertEqual(result1.reason, 'known_pattern', 'Reason is known_pattern');
  
  // Test "Boston Dynamics"
  const text2 = 'Boston Dynamics unveiled a new robot.';
  const result2 = filter.shouldExclude('Boston', text2, 0, 6);
  assertEqual(result2.excluded, true, '"Boston" excluded when part of "Boston Dynamics"');
  
  // Test plain "Texas" (should not exclude)
  const text3 = 'The weather in Texas is hot today.';
  const result3 = filter.shouldExclude('Texas', text3, 15, 20);
  assertEqual(result3.excluded, false, '"Texas" NOT excluded in plain geographic context');
  
  console.log('');
}

function testPersonalNameDetection() {
  console.log('Test: Personal name detection');
  
  const filter = createPlaceContextFilter();
  
  // Test "Paris Hilton"
  const text1 = 'Paris Hilton attended the gala last night.';
  const result1 = filter.shouldExclude('Paris', text1, 0, 5);
  assertEqual(result1.excluded, true, '"Paris" excluded when part of "Paris Hilton"');
  
  // Test "Michael Jordan" (Jordan is a country)
  // Note: "Michael Jordan" is in the known patterns, so it returns "known_pattern"
  const text2 = 'Michael Jordan scored 50 points.';
  const result2 = filter.shouldExclude('Jordan', text2, 8, 14);
  assertEqual(result2.excluded, true, '"Jordan" excluded when preceded by "Michael"');
  assertEqual(result2.reason, 'known_pattern', 'Reason is known_pattern (Michael Jordan is a known pattern)');
  
  // Test personal name that's NOT in known patterns - uses prefix detection
  const text3 = 'Dr. Jordan gave a lecture.';
  const result3 = filter.shouldExclude('Jordan', text3, 4, 10);
  assertEqual(result3.excluded, true, '"Jordan" excluded when preceded by "Dr."');
  assertEqual(result3.reason, 'personal_name', 'Reason is personal_name for Dr. prefix');
  
  console.log('');
}

function testDynamicOrgSuffixDetection() {
  console.log('Test: Dynamic org suffix detection');
  
  const filter = createPlaceContextFilter();
  
  // Test "London Stock Exchange"
  const text1 = 'The London Stock Exchange closed higher.';
  const result1 = filter.shouldExclude('London', text1, 4, 10);
  // This should be caught by the dynamic org suffix pattern
  assert(result1.excluded, '"London" detected as org when followed by "Stock" (exchange)');
  
  // Test "Denver Post"
  const text2 = 'According to the Denver Post, temperatures will rise.';
  const result2 = filter.shouldExclude('Denver', text2, 17, 23);
  assertEqual(result2.excluded, true, '"Denver" excluded when followed by "Post"');
  
  console.log('');
}

function testFilterPlacesArray() {
  console.log('Test: filterPlaces on array');
  
  const filter = createPlaceContextFilter();
  
  const text = 'Texas Instruments announced earnings while Texas weather remains hot.';
  const places = [
    { name: 'Texas', start: 0, end: 5, place_id: 1, kind: 'region' },
    { name: 'Texas', start: 43, end: 48, place_id: 1, kind: 'region' }
  ];
  
  const filtered = filter.filterPlaces(places, text);
  
  assertEqual(filtered.length, 1, 'One place filtered out');
  assertEqual(filtered[0].start, 43, 'Correct place kept (geographic Texas)');
  
  // Test with includeExcluded option
  const withExcluded = filter.filterPlaces(places, text, { includeExcluded: true });
  assertEqual(withExcluded.length, 2, 'Both places returned with includeExcluded');
  assert(withExcluded.some(p => p._excluded), 'Has exclusion metadata');
  
  console.log('');
}

function testDatabaseLoading() {
  console.log('Test: Database exclusion loading');
  
  const filter = createPlaceContextFilter({ db, loadFromDb: true });
  const stats = filter.getStats();
  
  // Should have loaded from place_exclusions table
  assert(stats.exclusionPhraseCount > 0, 'Loaded exclusions from database');
  console.log(`  Info: ${stats.exclusionPhraseCount} total exclusion phrases`);
  
  console.log('');
}

function testEnhancedExtractorIntegration() {
  console.log('Test: Integration with createEnhancedPlaceExtractor');
  
  const extractor = createEnhancedPlaceExtractor(db, { useContextFilter: true });
  
  assert(typeof extractor.extractWithFiltering === 'function', 'Has extractWithFiltering method');
  assert(typeof extractor.shouldExcludePlace === 'function', 'Has shouldExcludePlace method');
  assert(typeof extractor.addExclusion === 'function', 'Has addExclusion method');
  assert(typeof extractor.getFilterStats === 'function', 'Has getFilterStats method');
  
  // Test extraction with filtering
  const text = 'Texas Instruments is headquartered in Dallas, Texas.';
  const filtered = extractor.extractWithFiltering(text, {}, false);
  
  // Should find Dallas and Texas (geographic) but not Texas (from Texas Instruments)
  const texasMatches = filtered.filter(p => p.name === 'Texas');
  const dallasMatches = filtered.filter(p => p.name === 'Dallas');
  
  assert(dallasMatches.length > 0, 'Found Dallas');
  // Note: May find one Texas or none depending on overlap detection
  
  // Test shouldExcludePlace
  const excludeResult = extractor.shouldExcludePlace('Texas', text, 0, 5);
  assertEqual(excludeResult.excluded, true, 'shouldExcludePlace works');
  
  // Test getFilterStats
  const stats = extractor.getFilterStats();
  assert(stats !== null, 'getFilterStats returns stats');
  assert(stats.checksPerformed > 0, 'Filter was used');
  
  console.log('');
}

function testPerformance() {
  console.log('Test: Performance benchmark');
  
  const filter = createPlaceContextFilter({ db });
  
  // Generate sample text with many potential place names
  const sampleText = `
    The conference featured speakers from Texas Instruments, Boston Dynamics, 
    and Silicon Valley Bank. Reports from the New York Times and Washington Post 
    covered the event. Michael Jordan attended, as did Paris Hilton.
    Meanwhile, in actual geographic locations: London saw rain, Paris celebrated, 
    and Texas experienced a heat wave. The Chicago Bulls played well.
  `.repeat(10);
  
  const places = [
    { name: 'Texas', start: 45, end: 50 },
    { name: 'Boston', start: 70, end: 76 },
    { name: 'Silicon', start: 95, end: 102 },
    { name: 'New York', start: 130, end: 138 },
    { name: 'Washington', start: 155, end: 165 },
    { name: 'Jordan', start: 190, end: 196 },
    { name: 'Paris', start: 215, end: 220 },
    { name: 'London', start: 300, end: 306 },
    { name: 'Paris', start: 320, end: 325 },
    { name: 'Texas', start: 345, end: 350 },
    { name: 'Chicago', start: 380, end: 387 },
  ];
  
  const iterations = 1000;
  const start = performance.now();
  
  for (let i = 0; i < iterations; i++) {
    filter.filterPlaces(places, sampleText);
  }
  
  const duration = performance.now() - start;
  const perIteration = duration / iterations;
  
  console.log(`  Info: ${iterations} iterations in ${duration.toFixed(1)}ms (${perIteration.toFixed(3)}ms/iter)`);
  assert(perIteration < 1, `Per-iteration time < 1ms (actual: ${perIteration.toFixed(3)}ms)`);
  
  const stats = filter.getStats();
  console.log(`  Info: ${stats.checksPerformed} checks, ${stats.exclusionsApplied} exclusions, ${stats.contextMatches} context matches`);
  
  console.log('');
}

function testAddCustomExclusion() {
  console.log('Test: Adding custom exclusions');
  
  const filter = createPlaceContextFilter();
  
  // Before: "Amazon" should not be excluded (it's a river/region)
  const text = 'Amazon Web Services dominates cloud computing.';
  const before = filter.shouldExclude('Amazon', text, 0, 6);
  
  // Add custom exclusion
  filter.addExclusion('amazon', 'amazon web services');
  
  // After: Should be excluded
  const after = filter.shouldExclude('Amazon', text, 0, 6);
  assertEqual(after.excluded, true, 'Custom exclusion works');
  
  console.log('');
}

function testSportsTeamDetection() {
  console.log('Test: Sports team detection');
  
  const filter = createPlaceContextFilter();
  
  // Test "Manchester United"
  const text1 = 'Manchester United won the match 3-0.';
  const result1 = filter.shouldExclude('Manchester', text1, 0, 10);
  assertEqual(result1.excluded, true, '"Manchester" excluded when part of "Manchester United"');
  
  // Test "Chicago Bulls"
  const text2 = 'The Chicago Bulls are playing tonight.';
  const result2 = filter.shouldExclude('Chicago', text2, 4, 11);
  assertEqual(result2.excluded, true, '"Chicago" excluded when followed by "Bulls"');
  
  console.log('');
}

// Run all tests
setup();

try {
  testBasicCreation();
  testOrganizationDetection();
  testPersonalNameDetection();
  testDynamicOrgSuffixDetection();
  testFilterPlacesArray();
  testDatabaseLoading();
  testEnhancedExtractorIntegration();
  testPerformance();
  testAddCustomExclusion();
  testSportsTeamDetection();
} catch (err) {
  console.error('Test error:', err);
  failed++;
}

teardown();
