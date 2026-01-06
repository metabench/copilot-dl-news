'use strict';

/**
 * historical-analytics.check.js - Verify new historical metrics endpoints
 * 
 * Tests the new endpoints added to analyticsHub:
 * - GET /api/analytics/throughput
 * - GET /api/analytics/success-trend
 * - GET /api/analytics/hub-health
 * - GET /api/analytics/layout-signatures
 * 
 * Usage:
 *   node checks/historical-analytics.check.js
 */

const path = require('path');
const Database = require('better-sqlite3');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

// Direct test of AnalyticsService (no server needed)
function main() {
  console.log('='.repeat(60));
  console.log('Historical Analytics Check');
  console.log('='.repeat(60));
  console.log(`Database: ${DB_PATH}\n`);

  let db;
  try {
    db = new Database(DB_PATH, { readonly: true });
  } catch (err) {
    console.error('❌ Failed to open database:', err.message);
    process.exit(1);
  }

  const { AnalyticsService } = require('../src/ui/server/analyticsHub/AnalyticsService');
  const service = new AnalyticsService(db);

  // Test 1: Throughput Trend
  console.log('📊 1. Throughput Trend (7d)');
  try {
    const throughput = service.getThroughputTrend('7d');
    console.log(`   ✅ Got ${throughput.length} days of data`);
    if (throughput.length > 0) {
      const latest = throughput[throughput.length - 1];
      console.log(`   Latest: ${latest.day} - ${latest.totalPages} pages, ${latest.pagesPerHour} pages/hour`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test 2: Success Rate Trend
  console.log('\n📈 2. Success Rate Trend (7d)');
  try {
    const successTrend = service.getSuccessRateTrend('7d');
    console.log(`   ✅ Got ${successTrend.length} days of data`);
    if (successTrend.length > 0) {
      const latest = successTrend[successTrend.length - 1];
      console.log(`   Latest: ${latest.day} - ${latest.successRate}% success (${latest.success}/${latest.total})`);
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test 3: Hub Health
  console.log('\n🏥 3. Hub Health (top 10)');
  try {
    const hubHealth = service.getHubHealth(10);
    console.log(`   ✅ Got ${hubHealth.length} place hubs`);
    if (hubHealth.length > 0) {
      const staleHubs = hubHealth.filter(h => h.staleDays > 7);
      console.log(`   Stale hubs (>7 days): ${staleHubs.length}`);
      if (staleHubs.length > 0) {
        console.log(`   Most stale: ${staleHubs[0].title} (${staleHubs[0].staleDays} days, ${staleHubs[0].host})`);
      }
      const freshHubs = hubHealth.filter(h => h.staleDays <= 1);
      console.log(`   Fresh hubs (≤1 day): ${freshHubs.length}`);
    } else {
      console.log('   (No hubs found - place_hubs table may be empty)');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  // Test 4: Layout Signatures
  console.log('\n🧬 4. Layout Signatures (SkeletonHash)');
  try {
    const signatures = service.getLayoutSignatureStats(10);
    console.log(`   ✅ Total signatures: ${signatures.totalSignatures}`);
    console.log(`   L1 templates: ${signatures.l1Templates}, L2 structures: ${signatures.l2Structures}`);
    if (signatures.topClusters.length > 0) {
      const top = signatures.topClusters[0];
      console.log(`   Top cluster: ${top.hash} (seen ${top.seenCount} times)`);
    } else {
      console.log('   (No signatures found - run analysis with computeSkeletonHash:true)');
    }
  } catch (err) {
    console.log(`   ❌ Error: ${err.message}`);
  }

  console.log('\n' + '='.repeat(60));
  console.log('✅ Historical Analytics Check Complete');
  console.log('='.repeat(60));

  db.close();
}

main();
