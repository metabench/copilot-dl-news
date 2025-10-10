#!/usr/bin/env node
/**
 * Get Failing Tests - Simple Failure Extractor
 * 
 * Extracts and lists only the failing tests from the latest log.
 * Returns concise, actionable information for AI agents.
 * 
 * Usage:
 *   node tests/get-failing-tests.js           # All failing tests from latest log
 *   node tests/get-failing-tests.js unit      # Failing tests from latest unit log
 *   node tests/get-failing-tests.js --count   # Just count failing tests
 *   node tests/get-failing-tests.js --simple  # Just test file paths (no details)
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function getLatestLogPath(suiteFilter) {
  const cmd = suiteFilter 
    ? `node "${path.join(__dirname, 'get-latest-log.js')}" ${suiteFilter}`
    : `node "${path.join(__dirname, 'get-latest-log.js')}"`;
  
  try {
    return execSync(cmd, { encoding: 'utf8' }).trim();
  } catch (err) {
    console.error('Error: Could not find latest log file');
    process.exit(1);
  }
}

function extractFailingTests(logPath, mode = 'detailed') {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  const failures = [];
  
  // Parse the "All Test Results" section
  let inResultsSection = false;
  for (const line of lines) {
    if (line.includes('All Test Results')) {
      inResultsSection = true;
      continue;
    }
    
    if (!inResultsSection) continue;
    
    // Match lines like: "1. 5.61s - src\db\__tests__\dbAccess.test.js (13 tests, 13 passed, 0 failed)"
    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    
    if (match) {
      const [, runtime, testPath, totalTests, passed, failed] = match;
      
      if (parseInt(failed) > 0) {
        failures.push({
          testPath: testPath.trim(),
          runtime: parseFloat(runtime),
          totalTests: parseInt(totalTests),
          passed: parseInt(passed),
          failed: parseInt(failed)
        });
      }
    }
  }
  
  return failures;
}

function printFailures(failures, mode) {
  if (mode === 'count') {
    console.log(failures.length);
    return;
  }
  
  if (mode === 'simple') {
    failures.forEach(f => console.log(f.testPath));
    return;
  }
  
  // Detailed mode
  if (failures.length === 0) {
    console.log('✅ No failing tests found');
    return;
  }
  
  console.log(`\n❌ Found ${failures.length} test file(s) with failures:\n`);
  
  failures.forEach((f, idx) => {
    console.log(`${idx + 1}. ${f.testPath}`);
    console.log(`   Runtime: ${f.runtime}s | Failed: ${f.failed}/${f.totalTests} tests`);
    console.log('');
  });
}

// Parse arguments
const args = process.argv.slice(2);
let suiteFilter = null;
let mode = 'detailed';

for (const arg of args) {
  if (arg === '--count') {
    mode = 'count';
  } else if (arg === '--simple') {
    mode = 'simple';
  } else if (!arg.startsWith('--')) {
    suiteFilter = arg;
  }
}

// Execute
const logPath = getLatestLogPath(suiteFilter);
const failures = extractFailingTests(logPath, mode);
printFailures(failures, mode);

// Exit with appropriate code
process.exit(failures.length > 0 ? 1 : 0);
