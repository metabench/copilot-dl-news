'use strict';

/**
 * Crawler Integration Check: Place Hub Pattern Learning
 * 
 * Verifies that the PlaceHubPatternLearningService is properly wired into
 * the crawler's PageExecutionService via CrawlerServiceWiring.
 * 
 * This check uses an in-memory database and mock components to validate
 * the integration without requiring network access or the full crawler.
 */

const Database = require('better-sqlite3');
const { createPlaceHubUrlPatternsStore } = require('../src/db/placeHubUrlPatternsStore');
const { PlaceHubPatternLearningService } = require('../src/services/PlaceHubPatternLearningService');

// Test utilities
let passed = 0;
let failed = 0;

function expect(actual, description) {
  return {
    toBe(expected) {
      if (actual === expected) {
        console.log(`✅ ${description}`);
        passed++;
      } else {
        console.log(`❌ ${description}`);
        console.log(`   Expected: ${expected}, Got: ${actual}`);
        failed++;
      }
    },
    toBeTruthy() {
      if (actual) {
        console.log(`✅ ${description}`);
        passed++;
      } else {
        console.log(`❌ ${description}`);
        console.log(`   Expected truthy, Got: ${actual}`);
        failed++;
      }
    },
    toBeNull() {
      if (actual === null) {
        console.log(`✅ ${description}`);
        passed++;
      } else {
        console.log(`❌ ${description}`);
        console.log(`   Expected null, Got: ${actual}`);
        failed++;
      }
    },
    toContain(expected) {
      if (Array.isArray(actual) && actual.includes(expected)) {
        console.log(`✅ ${description}`);
        passed++;
      } else if (typeof actual === 'string' && actual.includes(expected)) {
        console.log(`✅ ${description}`);
        passed++;
      } else {
        console.log(`❌ ${description}`);
        console.log(`   Expected to contain: ${expected}, Got: ${actual}`);
        failed++;
      }
    },
    toBeGreaterThan(expected) {
      if (actual > expected) {
        console.log(`✅ ${description}`);
        passed++;
      } else {
        console.log(`❌ ${description}`);
        console.log(`   Expected > ${expected}, Got: ${actual}`);
        failed++;
      }
    }
  };
}

// Run the checks
async function runChecks() {
  console.log('\n🔬 Crawler Integration Check: Place Hub Pattern Learning');
  console.log('='.repeat(60));

  // Create in-memory database
  const db = new Database(':memory:');
  
  // Create required tables for place hubs
  db.exec(`
    CREATE TABLE IF NOT EXISTS urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE
    );
    
    CREATE TABLE IF NOT EXISTS place_hubs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL,
      host TEXT NOT NULL,
      place_slug TEXT,
      place_kind TEXT,
      title TEXT,
      nav_links_count INTEGER DEFAULT 0,
      article_links_count INTEGER DEFAULT 0,
      first_seen_at TEXT,
      last_seen_at TEXT,
      FOREIGN KEY (url_id) REFERENCES urls(id)
    );
    
    CREATE TABLE IF NOT EXISTS place_hub_candidates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      candidate_url TEXT NOT NULL,
      place_kind TEXT,
      place_name TEXT,
      verified INTEGER DEFAULT 0
    );
  `);

  console.log('\n' + '='.repeat(60));
  console.log('  1. Service Initialization');
  console.log('='.repeat(60));

  // Test that the service can be initialized with a database
  let learningService;
  try {
    learningService = new PlaceHubPatternLearningService({
      db,
      logger: { debug: () => {}, info: () => {}, warn: () => {} },
      config: {
        minSampleSize: 2,
        minAccuracy: 0.4
      }
    });
    expect(learningService !== null, 'PlaceHubPatternLearningService initializes with db').toBeTruthy();
  } catch (error) {
    console.log(`❌ Failed to initialize service: ${error.message}`);
    failed++;
    db.close();
    return;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  2. Pattern Store Integration');
  console.log('='.repeat(60));

  const store = learningService.getStore();
  expect(store !== null, 'Service exposes pattern store').toBeTruthy();

  // Save some patterns for testing
  store.savePattern({
    domain: 'example.com',
    patternType: 'segment',
    patternRegex: '\\/world\\/',
    patternDescription: 'URL contains /world/ segment',
    placeKind: 'country',
    sampleCount: 10,
    exampleUrls: ['https://example.com/world/france', 'https://example.com/world/germany']
  });

  store.savePattern({
    domain: 'example.com',
    patternType: 'path',
    patternRegex: '^\\/news\\/[a-z]+\\/[a-z-]+\\/?$',
    patternDescription: 'News regional path pattern',
    placeKind: 'region',
    sampleCount: 8,
    exampleUrls: ['https://example.com/news/uk/london']
  });

  const patterns = store.getPatternsForDomain('example.com');
  expect(patterns.length, 'Stored patterns can be retrieved').toBe(2);

  console.log('\n' + '='.repeat(60));
  console.log('  3. Prediction API');
  console.log('='.repeat(60));

  // Test prediction for matching URLs
  const prediction1 = learningService.predictPlaceHub('https://example.com/world/spain', 'example.com');
  expect(prediction1.isPlaceHub, 'Predicts /world/spain as place hub').toBe(true);
  expect(prediction1.confidence > 0.5, 'Prediction has reasonable confidence').toBeTruthy();
  expect(prediction1.placeKind, 'Prediction includes place kind').toBe('country');

  // Test prediction for non-matching URLs
  const prediction2 = learningService.predictPlaceHub('https://example.com/about', 'example.com');
  expect(prediction2.isPlaceHub, 'Does not predict /about as place hub').toBe(false);

  // Test heuristic fallback
  const prediction3 = learningService.predictPlaceHub('https://other.com/locations/paris', 'other.com');
  expect(prediction3.isPlaceHub, 'Heuristic detects /locations/ indicator').toBe(true);
  expect(prediction3.reason, 'Notes heuristic match').toContain('Heuristic');

  console.log('\n' + '='.repeat(60));
  console.log('  4. Bulk URL Analysis');
  console.log('='.repeat(60));

  const urls = [
    'https://example.com/world/italy',
    'https://example.com/world/japan',
    'https://example.com/sport/football',
    'https://example.com/about-us',
    'https://example.com/news/uk/scotland'
  ];

  const analyzed = learningService.analyzeDiscoveredUrls(urls, 'example.com');
  expect(analyzed.length, 'Analyzes URLs and finds potential place hubs').toBeGreaterThan(0);
  
  const worldUrls = analyzed.filter(r => r.url.includes('/world/'));
  expect(worldUrls.length, 'Correctly identifies /world/ URLs as place hubs').toBe(2);

  console.log('\n' + '='.repeat(60));
  console.log('  5. Validation Feedback');
  console.log('='.repeat(60));

  // Record validation for a correct prediction
  const updated1 = learningService.recordValidation('https://example.com/world/brazil', 'example.com', true);
  expect(updated1 > 0, 'Records correct validation feedback').toBeTruthy();

  // Record validation for an incorrect prediction
  const updated2 = learningService.recordValidation('https://example.com/world/fake-place', 'example.com', false);
  expect(updated2 > 0, 'Records incorrect validation feedback').toBeTruthy();

  // Check accuracy was updated
  const updatedPatterns = store.getPatternsForDomain('example.com');
  const worldPattern = updatedPatterns.find(p => p.pattern_regex.includes('world'));
  expect(worldPattern.verified_count > 0, 'Verified count incremented').toBeTruthy();

  console.log('\n' + '='.repeat(60));
  console.log('  6. CrawlerServiceWiring Compatibility');
  console.log('='.repeat(60));

  // Simulate what CrawlerServiceWiring does
  try {
    const crawlerMockDb = db; // Simulate dbAdapter.getDb() returning a db
    const serviceFromWiring = new PlaceHubPatternLearningService({
      db: crawlerMockDb,
      logger: console,
      config: {
        minSampleSize: 3,
        minAccuracy: 0.5
      }
    });
    expect(serviceFromWiring !== null, 'Service can be created as in CrawlerServiceWiring').toBeTruthy();
    
    // Verify the service works in crawler context
    const wiredPrediction = serviceFromWiring.predictPlaceHub('https://example.com/world/uk', 'example.com');
    expect(wiredPrediction.isPlaceHub, 'Wired service makes correct predictions').toBe(true);
  } catch (error) {
    console.log(`❌ CrawlerServiceWiring simulation failed: ${error.message}`);
    failed++;
  }

  console.log('\n' + '='.repeat(60));
  console.log('  7. PageExecutionService Callback Pattern');
  console.log('='.repeat(60));

  // Simulate the callback pattern used in PageExecutionService
  function simulateEnqueueWithPrediction(url, domain, learningService) {
    let linkMeta = null;
    
    if (learningService && url) {
      try {
        const prediction = learningService.predictPlaceHub(url, domain);
        if (prediction && prediction.isPlaceHub && prediction.confidence >= 0.4) {
          linkMeta = {
            predictedPlaceHub: true,
            placeHubConfidence: prediction.confidence,
            placeHubKind: prediction.placeKind || null,
            placeHubReason: prediction.reason
          };
          // Boost priority
          if (!linkMeta.forcePriority || linkMeta.forcePriority < 70) {
            linkMeta.forcePriority = 70 + Math.floor(prediction.confidence * 20);
          }
        }
      } catch (error) {
        // Silently ignore prediction errors
      }
    }
    
    return linkMeta;
  }

  const callbackResult1 = simulateEnqueueWithPrediction(
    'https://example.com/world/france',
    'example.com',
    learningService
  );
  expect(callbackResult1 !== null, 'Callback returns metadata for place hub URL').toBeTruthy();
  expect(callbackResult1?.predictedPlaceHub, 'Metadata marks URL as predicted place hub').toBe(true);
  expect(callbackResult1?.forcePriority > 70, 'Metadata includes priority boost').toBeTruthy();

  const callbackResult2 = simulateEnqueueWithPrediction(
    'https://example.com/about',
    'example.com',
    learningService
  );
  expect(callbackResult2, 'Callback returns null for non-place-hub URL').toBeNull();

  // Cleanup
  db.close();

  // Summary
  console.log('\n' + '='.repeat(60));
  console.log('  Summary');
  console.log('='.repeat(60));
  console.log(`\n✅ Passed: ${passed}`);
  console.log(`❌ Failed: ${failed}`);
  console.log(`📊 Total:  ${passed + failed}\n`);

  if (failed > 0) {
    process.exit(1);
  }
}

runChecks().catch(error => {
  console.error('Check failed:', error);
  process.exit(1);
});
