'use strict';

/**
 * Publisher Prior Check Script
 * 
 * Validates the PublisherPrior module:
 * - Database connection and prepared statements
 * - Prior calculation for known/unknown hosts
 * - Coverage explanation format
 * - Candidate batch scoring
 */

const path = require('path');
const Database = require('better-sqlite3');
const { PublisherPrior } = require('../src/analysis/publisher-prior');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

console.log('═══════════════════════════════════════════════════════════');
console.log('  Publisher Prior Check');
console.log('═══════════════════════════════════════════════════════════');
console.log(`Database: ${DB_PATH}\n`);

let db;
let publisherPrior;
let passed = 0;
let failed = 0;

function check(desc, condition) {
  if (condition) {
    console.log(`  ✅ ${desc}`);
    passed++;
  } else {
    console.log(`  ❌ ${desc}`);
    failed++;
  }
}

function checkSection(name, fn) {
  console.log(`\n┌─ ${name} ─────────────────────────────`);
  fn();
  console.log('└────────────────────────────────────────────');
}

try {
  db = new Database(DB_PATH, { readonly: true });
  publisherPrior = new PublisherPrior(db);
  
  checkSection('Module Export', () => {
    check('PublisherPrior class is exported', typeof PublisherPrior === 'function');
    check('Instance created successfully', publisherPrior instanceof PublisherPrior);
  });
  
  checkSection('Default Prior Behavior', () => {
    // Unknown host should return default prior
    const unknownPrior = publisherPrior.getPrior('nonexistent-host-xyz.com', 'GB');
    check('Unknown host returns valid prior', typeof unknownPrior === 'number');
    check('Unknown host prior in range [0.05, 0.8]', unknownPrior >= 0.05 && unknownPrior <= 0.8);
    console.log(`    Prior for unknown host: ${unknownPrior.toFixed(3)}`);
  });
  
  checkSection('Known Publisher Priors', () => {
    // Test with common news hosts that likely have coverage data
    const testCases = [
      { host: 'bbc.com', country: 'GB' },
      { host: 'bbc.co.uk', country: 'GB' },
      { host: 'theguardian.com', country: 'GB' },
      { host: 'nytimes.com', country: 'US' },
      { host: 'reuters.com', country: 'US' }
    ];
    
    for (const tc of testCases) {
      const prior = publisherPrior.getPrior(tc.host, tc.country);
      check(`getPrior('${tc.host}', '${tc.country}') returns number`, typeof prior === 'number');
      console.log(`    ${tc.host} → ${tc.country}: ${prior.toFixed(3)}`);
    }
  });
  
  checkSection('Explain Output Format', () => {
    const explanation = publisherPrior.explain('bbc.com', 'GB');
    
    check('explain() returns object', typeof explanation === 'object');
    check('Has host field', typeof explanation.host === 'string');
    check('Has countryCode field', typeof explanation.countryCode === 'string');
    check('Has prior field (number)', typeof explanation.prior === 'number');
    check('Has explanation object', typeof explanation.explanation === 'object');
    check('Has timestamp', typeof explanation.timestamp === 'string');
    
    console.log(`    Explanation for bbc.com → GB:`);
    console.log(`    - Prior: ${explanation.prior.toFixed(3)}`);
    console.log(`    - Reason: ${explanation.explanation.reason}`);
    console.log(`    - Total places: ${explanation.explanation.totalPlaces || 0}`);
  });
  
  checkSection('Candidate Batch Scoring', () => {
    const candidates = [
      { place_id: 1, country_code: 'GB' },
      { place_id: 2, country_code: 'US' },
      { place_id: 3, country_code: 'CA' }
    ];
    
    const scored = publisherPrior.scoreCandidates('bbc.com', candidates);
    
    check('scoreCandidates returns array', Array.isArray(scored));
    check('Returns same number of candidates', scored.length === candidates.length);
    check('Each candidate has publisherPrior field', 
      scored.every(c => typeof c.publisherPrior === 'number'));
    
    console.log('    Batch scores for bbc.com:');
    for (const c of scored) {
      console.log(`    - place_id ${c.place_id}, ${c.country_code}: ${c.publisherPrior.toFixed(3)}`);
    }
  });
  
  checkSection('Cache Behavior', () => {
    const host = 'test-cache-host.com';
    const country = 'DE';
    
    // Call twice - should hit cache on second call
    const prior1 = publisherPrior.getPrior(host, country);
    const prior2 = publisherPrior.getPrior(host, country);
    
    check('Repeated calls return same value', prior1 === prior2);
    
    const stats = publisherPrior.getCacheStats();
    check('getCacheStats returns object', typeof stats === 'object');
    check('Has size property', typeof stats.size === 'number');
    check('Has hosts array', Array.isArray(stats.hosts));
    
    console.log(`    Cache stats: size=${stats.size}, hosts=[${stats.hosts.slice(0, 5).join(', ')}${stats.hosts.length > 5 ? '...' : ''}]`);
  });
  
  checkSection('Edge Cases', () => {
    // Null/undefined host
    const nullHostPrior = publisherPrior.getPrior(null, 'GB');
    check('Null host handled gracefully', typeof nullHostPrior === 'number');
    
    // Empty country code
    const emptyCountryPrior = publisherPrior.getPrior('bbc.com', '');
    check('Empty country handled gracefully', typeof emptyCountryPrior === 'number');
    
    // Host normalization
    const wwwPrior = publisherPrior.getPrior('www.bbc.com', 'GB');
    const noWwwPrior = publisherPrior.getPrior('bbc.com', 'GB');
    console.log(`    www.bbc.com: ${wwwPrior.toFixed(3)}, bbc.com: ${noWwwPrior.toFixed(3)}`);
    // Note: These may differ based on data, but both should work
    check('www prefix handled', typeof wwwPrior === 'number');
  });
  
} catch (err) {
  console.error('\n❌ Check failed with error:', err.message);
  console.error(err.stack);
  process.exit(1);
} finally {
  if (db) db.close();
}

console.log('\n═══════════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('═══════════════════════════════════════════════════════════');

process.exit(failed > 0 ? 1 : 0);
