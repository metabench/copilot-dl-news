#!/usr/bin/env node
'use strict';

/**
 * Rerun only the tests that failed in the most recent test run.
 * 
 * Usage:
 *   node tests/run-failed-tests.js           # Run all failed tests
 *   node tests/run-failed-tests.js --suite unit  # Run failed tests from specific suite
 *   node tests/run-failed-tests.js --limit 5     # Run only first 5 failed tests
 */

const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FAILED_TESTS_FILE = path.join(__dirname, 'failed-tests.json');
const TEST_CONFIG_FILE = path.join(__dirname, 'test-config.json');

function loadFailedTests() {
  if (!fs.existsSync(FAILED_TESTS_FILE)) {
    console.error('❌ No failed-tests.json found. Run tests first or use:');
    console.error('   node tests/analyze-failures.js --list');
    process.exit(1);
  }
  
  const data = JSON.parse(fs.readFileSync(FAILED_TESTS_FILE, 'utf8'));
  return data;
}

function runFailedTests(options = {}) {
  const { suite = null, limit = null } = options;
  
  // First, generate the failed tests list
  console.log('🔍 Analyzing recent test failures...\n');
  const analyzeResult = spawnSync('node', [
    path.join(__dirname, 'analyze-failures.js'),
    '--list',
    ...(suite ? ['--suite', suite] : [])
  ], {
    stdio: 'inherit',
    cwd: path.dirname(__dirname)
  });
  
  if (analyzeResult.status !== 0) {
    console.error('❌ Failed to analyze test failures');
    process.exit(1);
  }
  
  const failedTests = loadFailedTests();
  
  if (failedTests.count === 0) {
    console.log('✅ No failed tests found!');
    return;
  }
  
  let filesToRun = failedTests.files;
  
  if (limit) {
    filesToRun = filesToRun.slice(0, parseInt(limit, 10));
    console.log(`\n⚡ Running first ${filesToRun.length} of ${failedTests.count} failed test(s)...\n`);
  } else {
    console.log(`\n⚡ Running ${failedTests.count} failed test(s)...\n`);
  }
  
  // Use Jest's testPathPattern to run only failed tests
  const testPattern = filesToRun
    .map(f => f.replace(/\\/g, '/').replace(/\//g, '\\/'))
    .join('|');
  
  const jestArgs = [
    '--experimental-vm-modules',
    'node_modules/jest/bin/jest.js',
    `--testPathPattern=${testPattern}`,
    '--reporters=./jest-timing-reporter.js',
    '--verbose'
  ];
  
  console.log('Running: node ' + jestArgs.join(' ') + '\n');
  console.log('═'.repeat(63) + '\n');
  
  const result = spawnSync('node', jestArgs, {
    stdio: 'inherit',
    cwd: path.dirname(__dirname),
    shell: true
  });
  
  console.log('\n' + '═'.repeat(63));
  console.log(`\n🏁 Failed tests rerun complete (exit code: ${result.status})\n`);
  
  // Analyze again to see if anything was fixed
  console.log('🔄 Re-analyzing test results...\n');
  spawnSync('node', [
    path.join(__dirname, 'analyze-test-logs.js'),
    '--summary'
  ], {
    stdio: 'inherit',
    cwd: path.dirname(__dirname)
  });
  
  process.exit(result.status || 0);
}

// CLI
if (require.main === module) {
  const args = process.argv.slice(2);
  const options = {};
  
  const suiteIdx = args.indexOf('--suite');
  if (suiteIdx !== -1 && args[suiteIdx + 1]) {
    options.suite = args[suiteIdx + 1];
  }
  
  const limitIdx = args.indexOf('--limit');
  if (limitIdx !== -1 && args[limitIdx + 1]) {
    options.limit = args[limitIdx + 1];
  }
  
  runFailedTests(options);
}

module.exports = { runFailedTests, loadFailedTests };
