'use strict';

/**
 * p2-improvements.check.js - Verify P2 improvements
 * 
 * Tests:
 * - Cross-domain pattern sharing (PatternSharingService)
 * - Quality scoring pipeline (QualityMetricsService trends)
 * 
 * Usage:
 *   node checks/p2-improvements.check.js
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function main() {
  console.log('='.repeat(60));
  console.log('P2 Improvements Check');
  console.log('='.repeat(60));
  console.log(`Database: ${DB_PATH}\n`);

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error('❌ Failed to open database:', err.message);
    process.exit(1);
  }

  // Test Quality Trending
  console.log('📊 1. Quality Trending (QualityMetricsService)');
  try {
    const { QualityMetricsService } = require('../src/ui/server/qualityDashboard/QualityMetricsService');
    const qualityService = new QualityMetricsService(db);
    
    // Test getQualityTrend
    const trend = qualityService.getQualityTrend('7d');
    console.log(`   ✅ getQualityTrend: ${trend.length} days of data`);
    if (trend.length > 0) {
      const latest = trend[trend.length - 1];
      console.log(`      Latest: ${latest.day} - ${latest.avgConfidence} avg, ${latest.highQualityPercent}% high quality`);
    }
    
    // Test getQualityByClassification
    const byClass = qualityService.getQualityByClassification('7d');
    console.log(`   ✅ getQualityByClassification: ${byClass.length} classifications`);
    if (byClass.length > 0) {
      console.log(`      Top: ${byClass[0].classification} (${byClass[0].count} articles, ${byClass[0].avgConfidence} avg)`);
    }
    
    // Test getQualityMovers
    const movers = qualityService.getQualityMovers('7d', 5);
    console.log(`   ✅ getQualityMovers: ${movers.improving.length} improving, ${movers.declining.length} declining`);
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test Pattern Sharing
  console.log('\n🔄 2. Cross-Domain Pattern Sharing (PatternSharingService)');
  try {
    const { PatternSharingService } = require('../src/ui/server/analyticsHub/PatternSharingService');
    const patternService = new PatternSharingService(db);
    
    // Test getCrossDomainsummary
    const summary = patternService.getCrossDomainsummary();
    console.log(`   ✅ getCrossDomainsummary: ${summary.totalPatterns} patterns from ${summary.uniqueDomains} domains`);
    if (summary.patternTypes.length > 0) {
      console.log(`      Pattern types: ${summary.patternTypes.map(t => `${t.type}(${t.count})`).join(', ')}`);
    }
    
    // Test getDomainFamilies
    const families = patternService.getDomainFamilies(5);
    console.log(`   ✅ getDomainFamilies: ${families.length} domain families (shared templates)`);
    if (families.length > 0) {
      console.log(`      Top family: ${families[0].domainCount} domains share template ${families[0].signatureHash.slice(0, 8)}...`);
    }
    
    // Test getDomainPatterns with a known domain
    const testDomain = 'www.theguardian.com';
    const patterns = patternService.getDomainPatterns(testDomain);
    console.log(`   ✅ getDomainPatterns(${testDomain}): ${patterns.patternCount} patterns`);
    
    // Test getPatternRecommendations
    const recs = patternService.getPatternRecommendations('www.example.com');
    console.log(`   ✅ getPatternRecommendations: ${recs.recommendations.length} recommendations available`);
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test Analytics Service new methods
  console.log('\n📈 3. Historical Analytics (AnalyticsService - P1 verification)');
  try {
    const { AnalyticsService } = require('../src/ui/server/analyticsHub/AnalyticsService');
    const analyticsService = new AnalyticsService(db);
    
    const throughput = analyticsService.getThroughputTrend('7d');
    console.log(`   ✅ getThroughputTrend: ${throughput.length} days`);
    
    const successTrend = analyticsService.getSuccessRateTrend('7d');
    console.log(`   ✅ getSuccessRateTrend: ${successTrend.length} days`);
    
    const hubHealth = analyticsService.getHubHealth(5);
    console.log(`   ✅ getHubHealth: ${hubHealth.length} hubs`);
    
    const signatures = analyticsService.getLayoutSignatureStats(5);
    console.log(`   ✅ getLayoutSignatureStats: ${signatures.totalSignatures} signatures`);
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ P2 Improvements Check Complete');
  console.log('='.repeat(60));

  console.log('\n📋 API Endpoints Added:');
  console.log('   Quality Dashboard (port 3102):');
  console.log('   - GET /api/quality/trend');
  console.log('   - GET /api/quality/by-classification');
  console.log('   - GET /api/quality/movers');
  console.log('');
  console.log('   Analytics Hub (port 3101):');
  console.log('   - GET /api/patterns/summary');
  console.log('   - GET /api/patterns/domain-families');
  console.log('   - GET /api/patterns/recommendations/:domain');
  console.log('   - GET /api/patterns/domain/:domain');

  db.close();
}

main();
