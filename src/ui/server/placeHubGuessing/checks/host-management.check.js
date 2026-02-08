#!/usr/bin/env node
/**
 * Check script for Host Management API
 * Tests the new /api/hosts/* endpoints for crawl eligibility and status
 * 
 * Run: node src/ui/server/placeHubGuessing/checks/host-management.check.js
 */
'use strict';

const { resolveBetterSqliteHandle } = require('../../utils/dashboardModule');
const { getHostPageCounts, getHostsAboveThreshold, getHostsBelowThreshold, getHostPageCount, getHostPageCountMap } = require('../../../../data/db/sqlite/v1/queries/placeHubGuessingUiQueries');

const CRAWL_THRESHOLD = 500;

function main() {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  Host Management API Check');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  // Resolve database
  const resolved = resolveBetterSqliteHandle({
    dbPath: 'data/news.db',
    readonly: true
  });
  
  if (resolved.error) {
    console.error('Failed to open database:', resolved.error.message);
    process.exit(1);
  }
  
  const dbHandle = resolved.dbHandle;
  
  try {
    // Test 1: Get all host page counts
    console.log('1. getHostPageCounts()');
    console.log('─────────────────────────────────────────────────────────────');
    const allHosts = getHostPageCounts(dbHandle);
    console.log(`   Total hosts: ${allHosts.length}`);
    if (allHosts.length > 0) {
      console.log('   Top 5 hosts by page count:');
      for (const host of allHosts.slice(0, 5)) {
        const eligibility = host.page_count >= CRAWL_THRESHOLD ? '✓ eligible' : `✗ needs ${CRAWL_THRESHOLD - host.page_count} more`;
        console.log(`     - ${host.host}: ${host.page_count} pages (${eligibility})`);
      }
    }
    console.log();
    
    // Test 2: Get hosts above threshold
    console.log('2. getHostsAboveThreshold(500)');
    console.log('─────────────────────────────────────────────────────────────');
    const eligibleHosts = getHostsAboveThreshold(dbHandle, CRAWL_THRESHOLD);
    console.log(`   Hosts with ${CRAWL_THRESHOLD}+ pages: ${eligibleHosts.length}`);
    if (eligibleHosts.length > 0) {
      console.log('   Examples:');
      for (const host of eligibleHosts.slice(0, 3)) {
        console.log(`     - ${host.host}: ${host.page_count} pages`);
      }
    }
    console.log();
    
    // Test 3: Get hosts below threshold
    console.log('3. getHostsBelowThreshold(500)');
    console.log('─────────────────────────────────────────────────────────────');
    const needsCrawling = getHostsBelowThreshold(dbHandle, CRAWL_THRESHOLD);
    console.log(`   Hosts needing crawling (< ${CRAWL_THRESHOLD} pages): ${needsCrawling.length}`);
    if (needsCrawling.length > 0) {
      console.log('   Examples:');
      for (const host of needsCrawling.slice(0, 3)) {
        const pagesNeeded = CRAWL_THRESHOLD - host.page_count;
        console.log(`     - ${host.host}: ${host.page_count} pages (needs ${pagesNeeded} more)`);
      }
    }
    console.log();
    
    // Test 4: Get single host page count
    console.log('4. getHostPageCount(host)');
    console.log('─────────────────────────────────────────────────────────────');
    if (allHosts.length > 0) {
      const testHost = allHosts[0].host;
      const hostStats = getHostPageCount(dbHandle, testHost);
      console.log(`   Test host: ${testHost}`);
      console.log(`   Page count: ${hostStats.page_count}`);
      console.log(`   Is eligible: ${hostStats.is_eligible ? 'Yes' : 'No'}`);
    } else {
      console.log('   No hosts available for testing');
    }
    console.log();
    
    // Test 5: Batch lookup with map
    console.log('5. getHostPageCountMap(hosts, threshold)');
    console.log('─────────────────────────────────────────────────────────────');
    const testHosts = allHosts.slice(0, 5).map(h => h.host);
    if (testHosts.length > 0) {
      const hostMap = getHostPageCountMap(dbHandle, testHosts, CRAWL_THRESHOLD);
      console.log(`   Batch lookup for ${testHosts.length} hosts:`);
      for (const [host, stats] of hostMap.entries()) {
        console.log(`     - ${host}: ${stats.page_count} pages, eligible=${stats.is_eligible}`);
      }
    } else {
      console.log('   No hosts available for testing');
    }
    console.log();
    
    // Summary
    console.log('═══════════════════════════════════════════════════════════════');
    console.log('  Summary');
    console.log('═══════════════════════════════════════════════════════════════');
    console.log(`   Total hosts: ${allHosts.length}`);
    console.log(`   Eligible (${CRAWL_THRESHOLD}+ pages): ${eligibleHosts.length}`);
    console.log(`   Needs crawling: ${needsCrawling.length}`);
    console.log(`   Crawl target: 600 pages per host`);
    console.log();
    console.log('   API Endpoints:');
    console.log('     GET  /api/hosts/status         - All hosts with eligibility');
    console.log('     GET  /api/hosts/:host/status   - Single host status');
    console.log('     POST /api/hosts/:host/crawl    - Start crawl for host');
    console.log('     GET  /api/hosts/crawls/active  - List active crawls');
    console.log('     POST /api/hosts/:host/analyze  - Run pattern analysis');
    console.log('     POST /api/hosts/:host/prepare  - Full crawl + analyze pipeline');
    console.log();
    console.log('   Scan with autoCrawl:');
    console.log('     POST /api/scan-place/:placeId { autoCrawl: true }');
    console.log('     - Automatically crawls hosts with < 500 pages before probing');
    console.log();
    console.log('✓ Check complete');
    
  } catch (err) {
    console.error('Error:', err.message);
    console.error(err.stack);
    process.exit(1);
  } finally {
    dbHandle.close();
  }
}

main();
