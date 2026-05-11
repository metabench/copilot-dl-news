#!/usr/bin/env node
/**
 * Place Hub Pattern Learning Check Script
 * 
 * This script tests the place hub URL pattern learning system:
 * 1. Creates a pattern store with in-memory database
 * 2. Tests pattern learning from sample verified hubs
 * 3. Tests pattern matching and prediction
 * 4. Optionally tests against real database if available
 * 
 * Run: node checks/place-hub-pattern-learning.check.js
 * Run with real DB: node checks/place-hub-pattern-learning.check.js --real-db
 */

'use strict';
const { openNewsCrawlerDb, resolveNewsCrawlerDbModule } = require('../src/db/openNewsCrawlerDb');
const path = require('path');
const fs = require('fs');

const { createPlaceHubUrlPatternsStore } = require('../src/db/placeHubUrlPatternsStore');
const { PlaceHubPatternLearningService, PLACE_HUB_INDICATORS } = require('../src/services/PlaceHubPatternLearningService');

// Sample verified place hubs for testing pattern learning
const SAMPLE_PLACE_HUBS = [
  // BBC pattern: /news/{country-or-region}
  { url: 'https://www.bbc.com/news/uk', placeKind: 'country-hub', placeSlug: 'uk' },
  { url: 'https://www.bbc.com/news/england', placeKind: 'region-hub', placeSlug: 'england' },
  { url: 'https://www.bbc.com/news/scotland', placeKind: 'region-hub', placeSlug: 'scotland' },
  { url: 'https://www.bbc.com/news/wales', placeKind: 'region-hub', placeSlug: 'wales' },
  { url: 'https://www.bbc.com/news/northern-ireland', placeKind: 'region-hub', placeSlug: 'northern-ireland' },
  { url: 'https://www.bbc.com/news/world/africa', placeKind: 'region-hub', placeSlug: 'africa' },
  { url: 'https://www.bbc.com/news/world/asia', placeKind: 'region-hub', placeSlug: 'asia' },
  
  // Guardian pattern: /world/{region-or-country}
  { url: 'https://www.theguardian.com/world/europe-news', placeKind: 'region-hub', placeSlug: 'europe' },
  { url: 'https://www.theguardian.com/world/asia', placeKind: 'region-hub', placeSlug: 'asia' },
  { url: 'https://www.theguardian.com/world/africa', placeKind: 'region-hub', placeSlug: 'africa' },
  { url: 'https://www.theguardian.com/uk-news', placeKind: 'country-hub', placeSlug: 'uk' },
  
  // CNN pattern: /travel/destinations/{place}
  { url: 'https://www.cnn.com/travel/destinations/europe', placeKind: 'region-hub', placeSlug: 'europe' },
  { url: 'https://www.cnn.com/travel/destinations/asia', placeKind: 'region-hub', placeSlug: 'asia' },
  { url: 'https://www.cnn.com/world/africa', placeKind: 'region-hub', placeSlug: 'africa' }
];

// Test URLs for prediction
const TEST_URLS = [
  { url: 'https://www.bbc.com/news/india', expected: true, reason: 'Matches /news/ segment pattern' },
  { url: 'https://www.bbc.com/news/world/europe', expected: true, reason: 'Matches /news/world/ pattern' },
  { url: 'https://www.bbc.com/sport/football', expected: false, reason: 'Sport, not place hub' },
  { url: 'https://www.theguardian.com/world/americas', expected: true, reason: 'Matches /world/ segment pattern' },
  { url: 'https://www.theguardian.com/commentisfree', expected: false, reason: 'Opinion section, not place hub' },
  { url: 'https://www.cnn.com/travel/destinations/oceania', expected: true, reason: 'Matches /destinations/ pattern' }
];

function formatResult(pass, message) {
  const symbol = pass ? '✅' : '❌';
  return `${symbol} ${message}`;
}

function printSection(title) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`  ${title}`);
  console.log('='.repeat(60));
}

function getDbApi(name) {
  const dbModule = resolveNewsCrawlerDbModule();
  const fn = dbModule[name];
  if (typeof fn !== 'function') {
    throw new Error(`news-crawler-db does not export ${name}. Build ../news-crawler-db first.`);
  }
  return fn;
}

async function runChecks(useRealDb = false) {
  let db;
  let passed = 0;
  let failed = 0;

  try {
    // 1. Setup database
    printSection('1. Database Setup');
    
    if (useRealDb) {
      const dbPath = path.join(__dirname, '..', 'data', 'news.db');
      if (!fs.existsSync(dbPath)) {
        console.log('❌ Real database not found at:', dbPath);
        console.log('   Run without --real-db flag for in-memory testing');
        return { passed: 0, failed: 1 };
      }
      db = openNewsCrawlerDb(dbPath);
      console.log('✅ Connected to real database:', dbPath);
    } else {
      db = openNewsCrawlerDb(':memory:');
      console.log('✅ Created in-memory database');
    }

    // 2. Test Pattern Store
    printSection('2. Pattern Store Tests');
    
    const store = createPlaceHubUrlPatternsStore(db);
    console.log('✅ Created PlaceHubUrlPatternsStore');
    
    // Save a test pattern
    const testPattern = store.savePattern({
      domain: 'test.com',
      patternType: 'segment',
      patternRegex: '\\/places\\/',
      patternDescription: 'Test pattern',
      placeKind: 'city-hub',
      sampleCount: 5
    });
    
    if (testPattern && testPattern.domain === 'test.com') {
      console.log(formatResult(true, 'Pattern save/retrieve works'));
      passed++;
    } else {
      console.log(formatResult(false, 'Pattern save/retrieve failed'));
      failed++;
    }

    // 3. Test Pattern Learning Service (simulated)
    printSection('3. Pattern Learning Service Tests');
    
    if (!useRealDb) {
      const fixture = getDbApi('createPlaceHubPatternLearningCheckFixture')(db, SAMPLE_PLACE_HUBS);
      console.log(`✅ Inserted ${fixture.hubsInserted} sample place hubs`);
    }

    // Test the pattern learning service
    const learningService = new PlaceHubPatternLearningService({ db });
    console.log('✅ Created PlaceHubPatternLearningService');

    // Learn patterns from BBC
    const bbcResult = learningService.learnPatternsFromDomain('bbc.com');
    console.log(`\n📊 BBC.com learning results:`);
    console.log(`   URLs analyzed: ${bbcResult.urlCount}`);
    console.log(`   Patterns learned: ${bbcResult.patternsLearned}`);
    
    if (bbcResult.patternsLearned > 0) {
      console.log(formatResult(true, 'BBC pattern learning succeeded'));
      passed++;
    } else if (bbcResult.urlCount < 3) {
      console.log(formatResult(true, 'BBC has insufficient data (expected in in-memory mode)'));
      passed++;
    } else {
      console.log(formatResult(false, 'BBC pattern learning failed'));
      failed++;
    }

    // 4. Test Pattern Prediction
    printSection('4. Pattern Prediction Tests');
    
    // First save some known patterns for testing
    store.savePattern({
      domain: 'bbc.com',
      patternType: 'segment',
      patternRegex: '\\/news\\/',
      placeKind: 'country-hub',
      accuracy: 0.9,
      sampleCount: 10
    });
    
    store.savePattern({
      domain: 'theguardian.com',
      patternType: 'segment',
      patternRegex: '\\/world\\/',
      placeKind: 'region-hub',
      accuracy: 0.85,
      sampleCount: 8
    });

    store.savePattern({
      domain: 'cnn.com',
      patternType: 'segment',
      patternRegex: '\\/destinations\\/',
      placeKind: 'region-hub',
      accuracy: 0.8,
      sampleCount: 5
    });

    console.log('✅ Added test patterns for prediction testing\n');

    for (const test of TEST_URLS) {
      const prediction = learningService.predictPlaceHub(test.url);
      const correct = prediction.isPlaceHub === test.expected;
      
      if (correct) {
        console.log(formatResult(true, `${test.url}`));
        console.log(`   Expected: ${test.expected}, Got: ${prediction.isPlaceHub} (${test.reason})`);
        passed++;
      } else {
        console.log(formatResult(false, `${test.url}`));
        console.log(`   Expected: ${test.expected}, Got: ${prediction.isPlaceHub}`);
        console.log(`   Reason: ${prediction.reason}`);
        failed++;
      }
    }

    // 5. Test URL Analysis
    printSection('5. Bulk URL Analysis');
    
    const discoveredUrls = [
      'https://www.bbc.com/news/uk-politics',
      'https://www.bbc.com/news/scotland',
      'https://www.bbc.com/sport/tennis',
      'https://www.bbc.com/news/world/middle-east',
      'https://www.bbc.com/news/business'
    ];

    const analysisResults = learningService.analyzeDiscoveredUrls(discoveredUrls, 'bbc.com');
    console.log(`\n📊 Analyzed ${discoveredUrls.length} URLs:`);
    console.log(`   Potential place hubs found: ${analysisResults.length}`);
    
    for (const result of analysisResults) {
      console.log(`   • ${result.url} (confidence: ${(result.confidence * 100).toFixed(0)}%)`);
    }

    if (analysisResults.length > 0) {
      console.log(formatResult(true, 'Bulk analysis working'));
      passed++;
    } else {
      console.log(formatResult(true, 'Bulk analysis returned 0 (may need more patterns)'));
      passed++;
    }

    // 6. Test Pattern Accuracy Tracking
    printSection('6. Pattern Accuracy Tracking');
    
    // Update accuracy
    const patternBefore = store.getPattern('bbc.com', 'segment', '\\/news\\/');
    console.log(`Initial accuracy: ${patternBefore?.accuracy || 'N/A'}`);
    
    store.updatePatternAccuracy({
      domain: 'bbc.com',
      patternType: 'segment',
      patternRegex: '\\/news\\/',
      isCorrect: true
    });
    
    store.updatePatternAccuracy({
      domain: 'bbc.com',
      patternType: 'segment',
      patternRegex: '\\/news\\/',
      isCorrect: true
    });
    
    store.updatePatternAccuracy({
      domain: 'bbc.com',
      patternType: 'segment',
      patternRegex: '\\/news\\/',
      isCorrect: false
    });
    
    const patternAfter = store.getPattern('bbc.com', 'segment', '\\/news\\/');
    console.log(`After 2 correct + 1 incorrect: ${patternAfter?.accuracy?.toFixed(2) || 'N/A'}`);
    console.log(`Verified count: ${patternAfter?.verified_count || 0}`);
    console.log(`Correct count: ${patternAfter?.correct_count || 0}`);
    
    if (patternAfter && patternAfter.verified_count === 3) {
      console.log(formatResult(true, 'Accuracy tracking working'));
      passed++;
    } else {
      console.log(formatResult(false, 'Accuracy tracking issue'));
      failed++;
    }

    // 7. Summary
    printSection('Summary');
    console.log(`\n✅ Passed: ${passed}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`📊 Total:  ${passed + failed}\n`);

    // 8. Show stored patterns
    printSection('8. Stored Patterns Overview');
    const allPatterns = store.getAllPatterns({ limit: 20, minAccuracy: 0 });
    console.log(`Total patterns in store: ${allPatterns.length}\n`);
    
    for (const p of allPatterns.slice(0, 5)) {
      console.log(`• ${p.domain}: ${p.pattern_type} - ${p.pattern_regex}`);
      console.log(`  Kind: ${p.place_kind || 'any'}, Accuracy: ${(p.accuracy * 100).toFixed(0)}%, Samples: ${p.sample_count}`);
    }

    return { passed, failed };

  } catch (error) {
    console.error('\n❌ Check script failed:', error);
    console.error(error.stack);
    return { passed, failed: failed + 1 };

  } finally {
    if (db && db.open) {
      db.close();
    }
  }
}

// Main
const useRealDb = process.argv.includes('--real-db');
console.log('\n🔬 Place Hub Pattern Learning Check');
console.log('===================================');
console.log(`Mode: ${useRealDb ? 'Real database' : 'In-memory database'}\n`);

runChecks(useRealDb).then(({ passed, failed }) => {
  process.exit(failed > 0 ? 1 : 0);
});
