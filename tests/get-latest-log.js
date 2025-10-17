#!/usr/bin/env node
/**
 * Get Latest Test Log - Simple Log File Locator
 * 
 * Returns the path to the most recent test log file.
 * Useful for AI agents to quickly find and read the latest test results.
 * 
 * Usage:
 *   node tests/get-latest-log.js              # Latest log (any suite)
 *   node tests/get-latest-log.js unit         # Latest unit test log
 *   node tests/get-latest-log.js e2e          # Latest E2E test log
 *   node tests/get-latest-log.js integration  # Latest integration test log
 *   node tests/get-latest-log.js ALL          # Latest full test suite log
 */

const fs = require('fs');
const path = require('path');

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function getLatestLog(suiteFilter = null) {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    console.error('Error: testlogs directory not found');
    process.exit(1);
  }

  const files = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .filter(f => {
      if (!suiteFilter) return true;
      // Match suite name at end: 2025-10-10T19-30-20-013Z_unit.log
      return f.includes(`_${suiteFilter}.log`);
    });

  if (files.length === 0) {
    if (suiteFilter) {
      console.error(`Error: No test logs found for suite: ${suiteFilter}`);
    } else {
      console.error('Error: No test logs found');
    }
    process.exit(1);
  }

  const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
  const timestamped = files.filter(f => TIMESTAMP_PATTERN.test(f));
  const prioritisedFiles = timestamped.length > 0 ? timestamped : files;

  prioritisedFiles.sort().reverse();
  const latestFile = prioritisedFiles[0];
  const fullPath = path.join(TESTLOGS_DIR, latestFile);

  console.log(fullPath);
  return fullPath;
}

// Parse command line arguments
const suiteFilter = process.argv[2] || null;
getLatestLog(suiteFilter);
