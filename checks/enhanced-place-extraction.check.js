/**
 * Check script for enhanced place extraction integration
 * 
 * Validates that:
 * 1. createEnhancedPlaceExtractor creates a working extractor
 * 2. pickBestCandidateEnhanced integrates publisher prior
 * 3. Multi-language queries work through the extractor
 * 4. Fallback works when enhanced modules aren't available
 */
'use strict';

const path = require('path');
const { openDatabase } = require('../src/db/sqlite/v1');
const {
  buildGazetteerMatchers,
  pickBestCandidate,
  pickBestCandidateEnhanced,
  createEnhancedPlaceExtractor,
  extractGazetteerPlacesFromText
} = require('../src/analysis/place-extraction');

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
  console.log('\n=== Enhanced Place Extraction Integration Check ===\n');
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

function testCreateEnhancedExtractor() {
  console.log('Test: createEnhancedPlaceExtractor');
  
  const extractor = createEnhancedPlaceExtractor(db);
  
  assert(extractor !== null, 'Extractor created');
  assert(extractor.matchers !== null, 'Matchers available');
  assert(extractor.matchers.nameMap instanceof Map, 'nameMap is a Map');
  assert(extractor.matchers.placeIndex instanceof Map, 'placeIndex is a Map');
  assert(typeof extractor.extractFromText === 'function', 'extractFromText is a function');
  assert(typeof extractor.extractWithPrior === 'function', 'extractWithPrior is a function');
  assert(typeof extractor.searchMultiLanguage === 'function', 'searchMultiLanguage is a function');
  assert(typeof extractor.detectScript === 'function', 'detectScript is a function');
  assert(typeof extractor.isAncestor === 'function', 'isAncestor is a function');
  
  console.log('');
}

function testBasicExtraction() {
  console.log('Test: Basic extraction through enhanced extractor');
  
  const extractor = createEnhancedPlaceExtractor(db);
  const text = 'The meeting was held in London yesterday.';
  
  const places = extractor.extractFromText(text, {}, false);
  
  assert(Array.isArray(places), 'Returns array');
  assert(places.length > 0, 'Found at least one place');
  
  if (places.length > 0) {
    const london = places.find(p => p.name === 'London' || p.name.toLowerCase().includes('london'));
    assert(london !== undefined, 'Found London');
    assert(london.kind !== undefined, 'Has kind');
    assert(london.place_id !== undefined, 'Has place_id');
  }
  
  console.log('');
}

function testExtractWithPrior() {
  console.log('Test: Extraction with publisher prior');
  
  const extractor = createEnhancedPlaceExtractor(db);
  const text = 'News from Paris and Berlin today.';
  
  // Extract with a test host
  const places = extractor.extractWithPrior(text, {}, false, 'example.com');
  
  assert(Array.isArray(places), 'Returns array');
  assert(places.length > 0, 'Found places');
  
  // The function should work even if example.com has no coverage
  // It falls back to standard scoring
  
  console.log('');
}

function testPickBestCandidateEnhanced() {
  console.log('Test: pickBestCandidateEnhanced function');
  
  // Create mock candidates
  const candidates = [
    { place_id: 1, name: 'London', country_code: 'GB', population: 8900000 },
    { place_id: 2, name: 'London', country_code: 'CA', population: 400000 }
  ];
  
  // Test without db/host - should fall back to standard
  const bestStandard = pickBestCandidateEnhanced(candidates, {}, false, {});
  assert(bestStandard !== null, 'Returns result without db/host');
  assertEqual(bestStandard.country_code, 'GB', 'Falls back to population-based selection (GB London)');
  
  // Test with domain context
  const bestWithContext = pickBestCandidateEnhanced(candidates, { domain_cc: 'CA' }, false, {});
  assertEqual(bestWithContext.country_code, 'CA', 'Respects domain context');
  
  // Test with db/host (enhanced mode)
  const bestEnhanced = pickBestCandidateEnhanced(candidates, {}, false, { db, host: 'bbc.co.uk' });
  assert(bestEnhanced !== null, 'Returns result with db/host');
  
  console.log('');
}

function testMultiLanguageSearch() {
  console.log('Test: Multi-language search through extractor');
  
  const extractor = createEnhancedPlaceExtractor(db);
  
  // Search for a place in English
  const englishResults = extractor.searchMultiLanguage('Germany', { limit: 5 });
  assert(Array.isArray(englishResults), 'Returns array for English search');
  
  // Search with limit
  const limitedResults = extractor.searchMultiLanguage('Paris', { limit: 3 });
  assert(limitedResults.length <= 3, 'Respects limit');
  
  console.log('');
}

function testScriptDetection() {
  console.log('Test: Script detection through extractor');
  
  const extractor = createEnhancedPlaceExtractor(db);
  
  const latinScript = extractor.detectScript('London');
  assert(latinScript === 'Latn', 'Detects Latin script');
  
  const hanScript = extractor.detectScript('北京');
  assert(hanScript === 'Hans' || hanScript === 'Hant', 'Detects Han script');
  
  const cyrillicScript = extractor.detectScript('Москва');
  assertEqual(cyrillicScript, 'Cyrl', 'Detects Cyrillic script');
  
  const arabicScript = extractor.detectScript('القاهرة');
  assertEqual(arabicScript, 'Arab', 'Detects Arabic script');
  
  console.log('');
}

function testHierarchyAccess() {
  console.log('Test: Hierarchy access through extractor');
  
  const extractor = createEnhancedPlaceExtractor(db);
  
  const hierarchy = extractor.getHierarchy();
  assert(hierarchy !== null, 'Returns hierarchy');
  assert(typeof hierarchy.isAncestor === 'function', 'Has isAncestor function');
  
  // Test isAncestor shortcut
  const isAncestorFn = extractor.isAncestor;
  assert(typeof isAncestorFn === 'function', 'isAncestor is accessible directly');
  
  console.log('');
}

function testFallbackBehavior() {
  console.log('Test: Fallback behavior');
  
  // Test with null candidates
  const result1 = pickBestCandidateEnhanced(null, {}, false, { db, host: 'test.com' });
  assertEqual(result1, null, 'Returns null for null candidates');
  
  // Test with empty array
  const result2 = pickBestCandidateEnhanced([], {}, false, { db, host: 'test.com' });
  assertEqual(result2, null, 'Returns null for empty array');
  
  // Test with single candidate
  const single = [{ place_id: 1, name: 'Test', country_code: 'US', population: 1000 }];
  const result3 = pickBestCandidateEnhanced(single, {}, false, { db, host: 'test.com' });
  assertEqual(result3.name, 'Test', 'Returns single candidate directly');
  
  console.log('');
}

function testCompareWithStandard() {
  console.log('Test: Compare enhanced vs standard extraction');
  
  const matchers = buildGazetteerMatchers(db);
  const text = 'Reports from Tokyo and Beijing confirm the news.';
  
  // Standard extraction
  const standardPlaces = extractGazetteerPlacesFromText(text, matchers, {}, false);
  
  // Enhanced extraction (via extractor)
  const extractor = createEnhancedPlaceExtractor(db);
  const enhancedPlaces = extractor.extractFromText(text, {}, false);
  
  // Should find same places (enhanced just scores differently)
  assertEqual(standardPlaces.length, enhancedPlaces.length, 'Same number of places found');
  
  if (standardPlaces.length > 0 && enhancedPlaces.length > 0) {
    const standardNames = standardPlaces.map(p => p.name).sort().join(',');
    const enhancedNames = enhancedPlaces.map(p => p.name).sort().join(',');
    assertEqual(standardNames, enhancedNames, 'Same place names extracted');
  }
  
  console.log('');
}

// Run all tests
setup();

try {
  testCreateEnhancedExtractor();
  testBasicExtraction();
  testExtractWithPrior();
  testPickBestCandidateEnhanced();
  testMultiLanguageSearch();
  testScriptDetection();
  testHierarchyAccess();
  testFallbackBehavior();
  testCompareWithStandard();
} catch (err) {
  console.error('Test error:', err);
  failed++;
}

teardown();
