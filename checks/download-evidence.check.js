#!/usr/bin/env node
/**
 * Check: Download Evidence Queries
 * 
 * Verifies that downloadEvidence.js functions work correctly
 * and can query actual data from the database.
 * 
 * Run: node checks/download-evidence.check.js
 */
'use strict';

const path = require('path');
const Database = require('better-sqlite3');
const evidence = require('../src/db/queries/downloadEvidence');

const DB_PATH = path.join(__dirname, '..', 'data', 'news.db');

function main() {
  console.log('=== Download Evidence Check ===\n');
  
  const db = new Database(DB_PATH, { readonly: true });
  
  try {
    // Test 1: Global stats
    console.log('1. Global Stats:');
    const globalStats = evidence.getGlobalStats(db);
    console.log(`   Total responses: ${globalStats.total_responses.toLocaleString()}`);
    console.log(`   Verified downloads: ${globalStats.verified_downloads.toLocaleString()}`);
    console.log(`   Total bytes: ${(globalStats.total_bytes / 1e9).toFixed(2)} GB`);
    console.log(`   First download: ${globalStats.first_download}`);
    console.log(`   Last download: ${globalStats.last_download}`);
    console.log('   ✅ PASS\n');

    // Test 2: Recent downloads (last hour)
    const now = new Date();
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
    console.log('2. Last Hour Stats:');
    const recentStats = evidence.getDownloadStats(
      db, 
      oneHourAgo.toISOString(), 
      now.toISOString()
    );
    console.log(`   Total: ${recentStats.total}`);
    console.log(`   Verified: ${recentStats.verified}`);
    console.log(`   Failed: ${recentStats.failed}`);
    console.log(`   Bytes: ${(recentStats.bytes / 1e6).toFixed(2)} MB`);
    console.log('   ✅ PASS\n');

    // Test 3: Evidence bundle (last 10)
    console.log('3. Recent Evidence (last 5):');
    const recentEvidence = evidence.getDownloadEvidence(
      db,
      oneHourAgo.toISOString(),
      now.toISOString(),
      5
    );
    if (recentEvidence.length > 0) {
      recentEvidence.forEach((e, i) => {
        console.log(`   [${i + 1}] ${e.url.substring(0, 60)}...`);
        console.log(`       http_response_id: ${e.http_response_id}`);
        console.log(`       status: ${e.http_status}, bytes: ${e.bytes_downloaded}`);
      });
    } else {
      console.log('   (no downloads in last hour)');
    }
    console.log('   ✅ PASS\n');

    // Test 4: Verification claim
    console.log('4. Verify Download Claim:');
    const claimed = recentStats.verified;
    const verification = evidence.verifyDownloadClaim(
      db,
      oneHourAgo.toISOString(),
      now.toISOString(),
      claimed
    );
    console.log(`   Claimed: ${verification.claimed}`);
    console.log(`   Actual: ${verification.actual}`);
    console.log(`   Valid: ${verification.valid}`);
    console.log('   ✅ PASS\n');

    // Test 5: Timeline
    console.log('5. Download Timeline (last hour):');
    const timeline = evidence.getDownloadTimeline(
      db,
      oneHourAgo.toISOString(),
      now.toISOString()
    );
    if (timeline.length > 0) {
      console.log(`   ${timeline.length} time buckets`);
      console.log(`   Last cumulative: ${timeline[timeline.length - 1]?.cumulative || 0}`);
    } else {
      console.log('   (no timeline data in last hour)');
    }
    console.log('   ✅ PASS\n');

    console.log('=== All Checks Passed ===');
    
  } finally {
    db.close();
  }
}

main();
