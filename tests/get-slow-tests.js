#!/usr/bin/env node
/**
 * Get Slow Tests - Extract Tests Above Performance Threshold
 * 
 * Lists tests exceeding specified runtime threshold.
 * Helps AI agents identify performance bottlenecks.
 * 
 * Usage:
 *   node tests/get-slow-tests.js              # Tests >5s from latest log
 *   node tests/get-slow-tests.js 10           # Tests >10s from latest log
 *   node tests/get-slow-tests.js 3 unit       # Tests >3s from latest unit log
 *   node tests/get-slow-tests.js --count      # Just count slow tests
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

function extractSlowTests(logPath, thresholdSeconds) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  const slowTests = [];
  
  // Parse the "All Test Results" section
  let inResultsSection = false;
  for (const line of lines) {
    if (line.includes('All Test Results')) {
      inResultsSection = true;
      continue;
    }
    
    if (!inResultsSection) continue;
    
    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    
    if (match) {
      const [, runtime, testPath, totalTests, passed, failed] = match;
      const runtimeNum = parseFloat(runtime);
      
      if (runtimeNum >= thresholdSeconds) {
        slowTests.push({
          testPath: testPath.trim(),
          runtime: runtimeNum,
          totalTests: parseInt(totalTests),
          passed: parseInt(passed),
          failed: parseInt(failed)
        });
      }
    }
  }
  
  return slowTests;
}

function printSlowTests(slowTests, threshold, mode) {
  if (mode === 'count') {
    console.log(slowTests.length);
    return;
  }
  
  if (slowTests.length === 0) {
    console.log(`✅ No tests exceeding ${threshold}s threshold`);
    return;
  }
  
  console.log(`\n⏱️  Found ${slowTests.length} test(s) exceeding ${threshold}s:\n`);
  
  slowTests.forEach((t, idx) => {
    const status = t.failed > 0 ? '❌' : '✅';
    console.log(`${idx + 1}. ${status} ${t.runtime}s - ${t.testPath}`);
    if (t.failed > 0) {
      console.log(`   Failed: ${t.failed}/${t.totalTests} tests`);
    }
  });
  console.log('');
}

// Parse arguments
const args = process.argv.slice(2);
let threshold = 5.0;
let suiteFilter = null;
let mode = 'detailed';

for (const arg of args) {
  if (arg === '--count') {
    mode = 'count';
  } else if (!arg.startsWith('--') && !isNaN(parseFloat(arg))) {
    threshold = parseFloat(arg);
  } else if (!arg.startsWith('--')) {
    suiteFilter = arg;
  }
}

// Execute
const logPath = getLatestLogPath(suiteFilter);
const slowTests = extractSlowTests(logPath, threshold);
printSlowTests(slowTests, threshold, mode);
