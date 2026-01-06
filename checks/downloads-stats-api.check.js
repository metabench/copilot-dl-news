#!/usr/bin/env node
/**
 * Downloads Stats API Check
 * 
 * Tests the download evidence queries directly against the database.
 * This bypasses the server to verify the queries work.
 */

'use strict';

const { openNewsDb } = require('../src/db/dbAccess');
const downloadEvidence = require('../src/db/queries/downloadEvidence');

console.log('='.repeat(60));
console.log('Downloads Stats API Check');
console.log('='.repeat(60));

try {
  console.log('\n1. Opening database...');
  const dbWrapper = openNewsDb();
  console.log('   ✓ Database wrapper opened');
  console.log('   Keys:', Object.keys(dbWrapper).slice(0, 5).join(', '), '...');
  
  console.log('\n2. Extracting raw db handle...');
  const rawDb = dbWrapper.db;
  console.log('   ✓ Raw db type:', typeof rawDb);
  console.log('   ✓ Is open:', rawDb.open);
  console.log('   ✓ Has prepare:', typeof rawDb.prepare === 'function');
  
  console.log('\n3. Testing getGlobalStats...');
  const stats = downloadEvidence.getGlobalStats(rawDb);
  console.log('   ✓ Stats returned:');
  console.log('   - Total downloads:', stats.totalDownloads);
  console.log('   - Verified count:', stats.verifiedCount);
  console.log('   - Total bytes:', stats.totalBytes);
  console.log('   - First download:', stats.firstDownload);
  console.log('   - Last download:', stats.lastDownload);
  
  console.log('\n4. Testing getDownloadStats with time range...');
  const now = new Date();
  const yesterday = new Date(now - 24 * 60 * 60 * 1000);
  const rangeStats = downloadEvidence.getDownloadStats(rawDb, yesterday.toISOString(), now.toISOString());
  console.log('   ✓ Range stats returned:');
  console.log('   - Downloads in range:', rangeStats.downloadCount);
  console.log('   - Bytes in range:', rangeStats.bytesDownloaded);
  console.log('   - Success count:', rangeStats.successCount);
  
  console.log('\n5. Closing database...');
  dbWrapper.close();
  console.log('   ✓ Database closed');
  
  console.log('\n' + '='.repeat(60));
  console.log('✅ ALL CHECKS PASSED');
  console.log('='.repeat(60));
  process.exit(0);
} catch (error) {
  console.error('\n❌ ERROR:', error.message);
  console.error(error.stack);
  process.exit(1);
}
