#!/usr/bin/env node
'use strict';

/**
 * Compare test results between two test runs to identify:
 * - Newly fixed tests
 * - New regressions
 * - Still broken tests
 * - Still passing tests
 * 
 * Usage:
 *   node tests/compare-test-runs.js                  # Compare latest 2 runs
 *   node tests/compare-test-runs.js --before --after # Compare specific runs by timestamp
 *   node tests/compare-test-runs.js --suite unit     # Compare within specific suite
 */

const fs = require('fs');
const path = require('path');
const { parseLogFile } = require('./analyze-failures');

const LOG_DIR = path.join(__dirname, '..', 'testlogs');

function getRecentLogs(suiteFilter = null, count = 2) {
  if (!fs.existsSync(LOG_DIR)) {
    return [];
  }
  
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log'))
    .filter(f => !suiteFilter || f.includes(`_${suiteFilter}.log`))
    .map(f => path.join(LOG_DIR, f))
    .sort()
    .reverse()
    .slice(0, count);
}

function extractTestIdentifiers(logData) {
  const failing = new Map();
  const passing = new Set();
  
  logData.failures.forEach(fileFailure => {
    fileFailure.tests.forEach(test => {
      const key = `${fileFailure.file}::${test.fullName}`;
      failing.set(key, {
        file: fileFailure.file,
        test: test.fullName,
        error: test.errorType || 'Unknown',
        line: test.lineNumber
      });
    });
  });
  
  // TODO: Extract passing tests from log (requires parsing PASS sections)
  // For now, we only track failures
  
  return { failing, passing };
}

function compareLogs(beforeLog, afterLog) {
  const before = parseLogFile(beforeLog);
  const after = parseLogFile(afterLog);
  
  const beforeTests = extractTestIdentifiers(before);
  const afterTests = extractTestIdentifiers(after);
  
  const fixed = [];
  const regressions = [];
  const stillBroken = [];
  
  // Find fixed tests (in before.failing but not in after.failing)
  beforeTests.failing.forEach((details, key) => {
    if (!afterTests.failing.has(key)) {
      fixed.push(details);
    }
  });
  
  // Find regressions (in after.failing but not in before.failing)
  afterTests.failing.forEach((details, key) => {
    if (!beforeTests.failing.has(key)) {
      regressions.push(details);
    }
  });
  
  // Find still broken (in both before.failing and after.failing)
  beforeTests.failing.forEach((details, key) => {
    if (afterTests.failing.has(key)) {
      stillBroken.push(details);
    }
  });
  
  return {
    before: {
      timestamp: before.timestamp,
      suite: before.suite,
      failures: before.totalFailures
    },
    after: {
      timestamp: after.timestamp,
      suite: after.suite,
      failures: after.totalFailures
    },
    fixed,
    regressions,
    stillBroken
  };
}

function displayComparison(comparison) {
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('📊 TEST RUN COMPARISON');
  console.log('═══════════════════════════════════════════════════════════════\n');
  
  console.log('Before:');
  console.log(`  📅 ${comparison.before.timestamp}`);
  console.log(`  📦 Suite: ${comparison.before.suite}`);
  console.log(`  ❌ Failures: ${comparison.before.failures}\n`);
  
  console.log('After:');
  console.log(`  📅 ${comparison.after.timestamp}`);
  console.log(`  📦 Suite: ${comparison.after.suite}`);
  console.log(`  ❌ Failures: ${comparison.after.failures}\n`);
  
  const delta = comparison.after.failures - comparison.before.failures;
  const deltaSymbol = delta > 0 ? '📈' : delta < 0 ? '📉' : '➡️';
  const deltaText = delta > 0 ? `+${delta}` : delta < 0 ? delta : '±0';
  console.log(`${deltaSymbol} Net change: ${deltaText} failure(s)\n`);
  
  console.log('─'.repeat(63));
  
  if (comparison.fixed.length > 0) {
    console.log(`\n✅ FIXED (${comparison.fixed.length}):\n`);
    comparison.fixed.forEach((test, idx) => {
      console.log(`  ${idx + 1}. ${test.file}`);
      console.log(`     ${test.test}`);
      console.log('');
    });
  }
  
  if (comparison.regressions.length > 0) {
    console.log(`\n⚠️  NEW REGRESSIONS (${comparison.regressions.length}):\n`);
    comparison.regressions.forEach((test, idx) => {
      console.log(`  ${idx + 1}. ${test.file}`);
      console.log(`     ${test.test}`);
      console.log(`     Error: ${test.error}`);
      console.log('');
    });
  }
  
  if (comparison.stillBroken.length > 0) {
    console.log(`\n🔴 STILL BROKEN (${comparison.stillBroken.length}):\n`);
    comparison.stillBroken.forEach((test, idx) => {
      console.log(`  ${idx + 1}. ${test.file}`);
      console.log(`     ${test.test}`);
      console.log('');
    });
  }
  
  console.log('═'.repeat(63) + '\n');
  
  // Summary
  const fixRate = comparison.before.failures > 0 
    ? (comparison.fixed.length / comparison.before.failures * 100).toFixed(1)
    : 0;
  
  console.log(`📈 Fix rate: ${fixRate}% (${comparison.fixed.length}/${comparison.before.failures})`);
  console.log(`⚠️  Regression rate: ${comparison.regressions.length} new failure(s)`);
  console.log(`🔄 Progress: ${comparison.before.failures} → ${comparison.after.failures} failures\n`);
}

function compareTestRuns(options = {}) {
  const { suite = null, before = null, after = null } = options;
  
  let logs;
  
  if (before && after) {
    logs = [after, before]; // Most recent first
  } else {
    logs = getRecentLogs(suite, 2);
  }
  
  if (logs.length < 2) {
    console.error('❌ Not enough test logs to compare. Need at least 2 runs.');
    process.exit(1);
  }
  
  const comparison = compareLogs(logs[1], logs[0]); // before, after
  displayComparison(comparison);
  
  return comparison;
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  const suiteIdx = args.indexOf('--suite');
  if (suiteIdx !== -1 && args[suiteIdx + 1]) {
    options.suite = args[suiteIdx + 1];
  }
  
  const beforeIdx = args.indexOf('--before');
  if (beforeIdx !== -1 && args[beforeIdx + 1]) {
    options.before = args[beforeIdx + 1];
  }
  
  const afterIdx = args.indexOf('--after');
  if (afterIdx !== -1 && args[afterIdx + 1]) {
    options.after = args[afterIdx + 1];
  }
  
  compareTestRuns(options);
}

module.exports = { compareTestRuns, compareLogs };
