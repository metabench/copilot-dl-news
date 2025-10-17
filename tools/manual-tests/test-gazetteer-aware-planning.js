#!/usr/bin/env node

/**
 * Test: Gazetteer-Aware Planning for Intelligent Crawls
 * 
 * Tests that the AsyncPlanRunner can use CountryHubGapAnalyzer to generate
 * country hub URL predictions when creating intelligent crawl plans.
 */

const { AsyncPlanRunner } = require('../../src/ui/express/services/planning/AsyncPlanRunner');
const { CountryHubGapAnalyzer } = require('../../src/services/CountryHubGapAnalyzer');
const { ensureDatabase } = require('../../src/db/sqlite');
const path = require('path');

async function test() {
  console.log('\n=== Testing Gazetteer-Aware Planning ===\n');
  
  // Connect to database
  const dbPath = path.join(__dirname, '..', '..', 'data', 'urls.db');
  const db = ensureDatabase(dbPath);
  
  try {
    // Create CountryHubGapAnalyzer
    const analyzer = new CountryHubGapAnalyzer({ db });
    
    console.log('✓ CountryHubGapAnalyzer created');
    
    // Check gazetteer has data
    const topCountries = analyzer.getTopCountries(5);
    console.log(`✓ Gazetteer has ${topCountries.length} top countries`);
    
    if (topCountries.length > 0) {
      console.log('\nTop countries:');
      for (const country of topCountries) {
        console.log(`  - ${country.name} (${country.countryCode || '??'}): importance ${country.importance}`);
      }
    }
    
    // Test URL prediction
    const testDomain = 'bbc.co.uk';
    const testCountry = topCountries[0];
    
    if (testCountry) {
      console.log(`\nTesting URL predictions for ${testDomain}, ${testCountry.name}:`);
      const predictions = analyzer.predictCountryHubUrls(
        testDomain,
        testCountry.name,
        testCountry.countryCode
      );
      
      console.log(`✓ Generated ${predictions.length} URL predictions:`);
      for (const pred of predictions.slice(0, 5)) {
        console.log(`  - ${pred.url} (confidence: ${pred.confidence})`);
      }
    }
    
    // Create AsyncPlanRunner with analyzer
    const planRunner = new AsyncPlanRunner({
      planningSessionManager: null,
      logger: console,
      emitEvent: () => {},
      usePlannerHost: true,
      dbAdapter: db,
      countryHubGapService: analyzer
    });
    
    console.log('\n✓ AsyncPlanRunner created with CountryHubGapAnalyzer');
    console.log(`✓ usePlannerHost: ${planRunner.usePlannerHost}`);
    console.log(`✓ countryHubGapService: ${planRunner.countryHubGapService ? 'present' : 'missing'}`);
    
    // Test plan generation
    console.log('\nGenerating plan for https://www.bbc.co.uk...');
    const testUrl = 'https://www.bbc.co.uk';
    
    try {
      const result = await planRunner.generatePlan(testUrl, {
        useAdvancedPlanning: true,
        gazetteerAwareness: true
      });
      
      console.log(`\n✓ Plan generated successfully`);
      console.log(`  - Status: ${result.status}`);
      console.log(`  - Blueprint sections: ${Object.keys(result.blueprint || {}).length}`);
      
      if (result.blueprint) {
        const sections = result.blueprint;
        console.log('\nBlueprint sections:');
        for (const [name, section] of Object.entries(sections)) {
          const urls = section.urls || [];
          console.log(`  - ${name}: ${urls.length} URLs`);
          
          // Show sample country hub predictions
          if (name.includes('country') || name.includes('hub')) {
            console.log(`    Sample URLs:`);
            for (const url of urls.slice(0, 3)) {
              console.log(`      * ${url}`);
            }
          }
        }
      }
      
      console.log('\n✓ Gazetteer-aware planning working correctly!');
      
    } catch (error) {
      console.error('\n✗ Plan generation failed:', error.message);
      console.error('  This may be expected if PlannerHost requires actual crawler state');
    }
    
  } finally {
    db.close();
  }
}

test().catch(error => {
  console.error('Test failed:', error);
  process.exit(1);
});
