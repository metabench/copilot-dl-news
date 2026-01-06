/**
 * Check: Downloads API endpoint test
 * 
 * This check verifies the downloads API works correctly
 */
'use strict';

const path = require('path');
const fs = require('fs');

const outputPath = path.join(__dirname, '..', 'tmp', 'downloads-check-output.txt');

function log(msg) {
  const line = new Date().toISOString() + ' ' + msg;
  console.log(line);
  fs.appendFileSync(outputPath, line + '\n');
}

async function runCheck() {
  // Clear output file
  fs.writeFileSync(outputPath, '');
  
  log('=== Downloads API Check ===');
  
  try {
    // Test the evidence queries directly (without server)
    const downloadEvidence = require('../src/db/queries/downloadEvidence');
    const { openNewsDb } = require('../src/db/dbAccess');
    
    log('Opening database...');
    const db = openNewsDb();
    const rawDb = db.db;
    
    log('Testing getGlobalStats...');
    const stats = downloadEvidence.getGlobalStats(rawDb);
    log('Global stats: ' + JSON.stringify(stats));
    
    log('Testing getDownloadStats...');
    const now = new Date();
    const yesterday = new Date(now.getTime() - 24*60*60*1000);
    const rangeStats = downloadEvidence.getDownloadStats(
      rawDb, 
      yesterday.toISOString(), 
      now.toISOString()
    );
    log('24h stats: ' + JSON.stringify(rangeStats));
    
    db.close();
    log('=== Check passed ===');
    process.exit(0);
  } catch (error) {
    log('ERROR: ' + error.message);
    log('Stack: ' + error.stack);
    process.exit(1);
  }
}

runCheck();
