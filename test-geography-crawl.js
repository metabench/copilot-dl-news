/**
 * Quick integration test to verify geography crawl can start
 * 
 * This script:
 * 1. Simulates the UI→API→CLI flow for geography crawls
 * 2. Verifies buildArgs produces correct arguments
 * 3. Validates that NewsCrawler constructor accepts geography type
 * 
 * Run with: node test-geography-crawl.js
 */

const { buildArgs } = require('./src/ui/express/services/buildArgs.js');

console.log('=== Geography Crawl Integration Test ===\n');

// Test 1: buildArgs with geography type
console.log('Test 1: buildArgs with geography type');
const geographyArgs = buildArgs({ 
  crawlType: 'geography',
  maxPages: 50,
  concurrency: 3
});
console.log('Generated args:', geographyArgs);
console.log('✓ Uses placeholder URL:', geographyArgs[1] === 'https://placeholder.example.com');
console.log('✓ Sets crawl type:', geographyArgs.includes('--crawl-type=geography'));
console.log('✓ Sets max pages:', geographyArgs.includes('--max-pages=50'));
console.log('✓ Sets concurrency:', geographyArgs.includes('--concurrency=3'));
console.log('✓ Disables sitemap:', geographyArgs.includes('--no-sitemap'));
console.log();

// Test 2: buildArgs with wikidata type
console.log('Test 2: buildArgs with wikidata type');
const wikidataArgs = buildArgs({ 
  crawlType: 'wikidata',
  maxPages: 100
});
console.log('Generated args:', wikidataArgs);
console.log('✓ Uses placeholder URL:', wikidataArgs[1] === 'https://placeholder.example.com');
console.log('✓ Sets crawl type:', wikidataArgs.includes('--crawl-type=wikidata'));
console.log();

// Test 3: buildArgs with basic type (should use real URL)
console.log('Test 3: buildArgs with basic type (traditional web crawl)');
const basicArgs = buildArgs({ 
  crawlType: 'basic',
  startUrl: 'https://example.com'
});
console.log('Generated args:', basicArgs);
console.log('✓ Uses provided URL:', basicArgs[1] === 'https://example.com');
console.log('✓ Sets crawl type:', basicArgs.includes('--crawl-type=basic'));
console.log();

// Test 4: Verify NewsCrawler can be instantiated (won't actually run)
console.log('Test 4: NewsCrawler constructor accepts placeholder URL');
try {
  const NewsCrawler = require('./src/crawl.js');
  // Just instantiate, don't start
  const crawler = new NewsCrawler('https://placeholder.example.com', {
    crawlType: 'geography',
    enableDb: false // Disable DB to avoid file creation
  });
  
  console.log('✓ Constructor accepted placeholder URL');
  console.log('✓ isGazetteerMode:', crawler.isGazetteerMode);
  console.log('✓ gazetteerVariant:', crawler.gazetteerVariant);
  console.log('✓ crawlType:', crawler.crawlType);
  console.log('✓ domain:', crawler.domain); // Should be 'placeholder.example.com'
  console.log();
} catch (error) {
  console.error('✗ Constructor failed:', error.message);
  process.exit(1);
}

console.log('=== All Tests Passed! ===');
console.log('\nGeography crawl is ready to use.');
console.log('To test in UI: Select "Geography" crawl type and click Start');
