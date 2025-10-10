#!/usr/bin/env node
/**
 * Get Test Summary - Quick Test Status Overview
 * 
 * Extracts key metrics from the latest test log in a concise format.
 * Perfect for AI agents to quickly understand test status.
 * 
 * Usage:
 *   node tests/get-test-summary.js              # Summary from latest log
 *   node tests/get-test-summary.js unit         # Summary from latest unit log
 *   node tests/get-test-summary.js --json       # Output as JSON
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

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

function extractSummary(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  const summary = {
    timestamp: null,
    suite: null,
    totalRuntime: 0,
    totalFiles: 0,
    totalTests: 0,
    passedTests: 0,
    failedTests: 0,
    slowTests: 0,
    verySlowTests: 0,
    failingFiles: []
  };
  
  // Extract timestamp and suite from header
  const timestampMatch = content.match(/Test Timing Report - (.+)/);
  if (timestampMatch) summary.timestamp = timestampMatch[1];
  
  const suiteMatch = content.match(/Suite: (.+)/);
  if (suiteMatch) summary.suite = suiteMatch[1];
  
  // Extract performance summary
  const totalRuntimeMatch = content.match(/Total Runtime:\s+([\d.]+)s/);
  if (totalRuntimeMatch) summary.totalRuntime = parseFloat(totalRuntimeMatch[1]);
  
  const totalFilesMatch = content.match(/Total Test Files:\s+(\d+)/);
  if (totalFilesMatch) summary.totalFiles = parseInt(totalFilesMatch[1]);
  
  const slowTestsMatch = content.match(/Slow Tests \(>5s\):\s+(\d+)/);
  if (slowTestsMatch) summary.slowTests = parseInt(slowTestsMatch[1]);
  
  const verySlowTestsMatch = content.match(/Very Slow Tests \(>10s\):\s+(\d+)/);
  if (verySlowTestsMatch) summary.verySlowTests = parseInt(verySlowTestsMatch[1]);
  
  // Extract test counts from results section
  let inResultsSection = false;
  for (const line of lines) {
    if (line.includes('All Test Results')) {
      inResultsSection = true;
      continue;
    }
    
    if (!inResultsSection) continue;
    
    const match = line.match(/^\d+\.\s+[\d.]+s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    
    if (match) {
      const [, testPath, totalTests, passed, failed] = match;
      const failedCount = parseInt(failed);
      
      summary.totalTests += parseInt(totalTests);
      summary.passedTests += parseInt(passed);
      summary.failedTests += failedCount;
      
      if (failedCount > 0) {
        summary.failingFiles.push(testPath.trim());
      }
    }
  }
  
  return summary;
}

function printSummary(summary, asJson) {
  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }
  
  // Human-readable format
  console.log(`\n📊 Test Summary (${summary.suite || 'unknown'})`);
  console.log(`   Timestamp: ${summary.timestamp || 'unknown'}`);
  console.log(`   Runtime: ${summary.totalRuntime}s`);
  console.log('');
  console.log(`   Files:  ${summary.totalFiles} test files`);
  console.log(`   Tests:  ${summary.totalTests} total (${summary.passedTests} passed, ${summary.failedTests} failed)`);
  console.log(`   Slow:   ${summary.slowTests} files >5s, ${summary.verySlowTests} files >10s`);
  
  if (summary.failingFiles.length > 0) {
    console.log(`\n   ❌ ${summary.failingFiles.length} failing file(s):`);
    summary.failingFiles.forEach(f => console.log(`      - ${f}`));
  } else {
    console.log(`\n   ✅ All tests passing`);
  }
  console.log('');
}

// Parse arguments
const args = process.argv.slice(2);
let suiteFilter = null;
let asJson = false;

for (const arg of args) {
  if (arg === '--json') {
    asJson = true;
  } else if (!arg.startsWith('--')) {
    suiteFilter = arg;
  }
}

// Execute
const logPath = getLatestLogPath(suiteFilter);
const summary = extractSummary(logPath);
printSummary(summary, asJson);

// Exit with appropriate code
process.exit(summary.failedTests > 0 ? 1 : 0);
