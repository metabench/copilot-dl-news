#!/usr/bin/env node
/**
 * Test Log Analyzer - AI Agent Test Status Tool
 * 
 * Analyzes test timing logs to help AI agents understand:
 * - What tests are currently broken
 * - What tests have been fixed (comparing older vs newer logs)
 * - Test performance trends
 * - Specific test failures within broader test runs
 * 
 * Features:
 * - Import legacy logs from root directory (backwards compatible)
 * - Track test status changes over time
 * - Identify regressions (tests that were passing, now failing)
 * - Identify fixes (tests that were failing, now passing)
 * - Smart handling of partial vs full test runs
 * 
 * Usage:
 *   node tests/analyze-test-logs.js                # Analyze current status
 *   node tests/analyze-test-logs.js --import       # Import legacy logs from root
 *   node tests/analyze-test-logs.js --summary      # Brief summary only
 *   node tests/analyze-test-logs.js --verbose      # Detailed analysis
 *   node tests/analyze-test-logs.js --test <name>  # Status of specific test
 */

const fs = require('fs');
const path = require('path');

// Ensure proper emoji encoding for console output
if (process.platform === 'win32') {
  // Force UTF-8 encoding on Windows
  process.stdout.setDefaultEncoding('utf8');
  if (process.stdout.isTTY) {
    // Enable UTF-8 mode for Windows Terminal
    process.stdout.write('\x1b[?1h\x1b=');
  }
}

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');
const ROOT_DIR = path.join(__dirname, '..');

class TestLogAnalyzer {
  constructor() {
    this.logs = [];
    this.testHistory = new Map(); // testPath -> array of results over time
  }

  /**
   * Import legacy test-timing-*.log files from root directory
   */
  importLegacyLogs() {
    const rootFiles = fs.readdirSync(ROOT_DIR);
    const legacyLogs = rootFiles.filter(f => f.startsWith('test-timing-') && f.endsWith('.log'));
    
    if (legacyLogs.length === 0) {
      console.log('✓ No legacy log files found in root directory');
      return { imported: 0, deleted: 0 };
    }

    console.log(`\n📥 Found ${legacyLogs.length} legacy log files in root directory`);
    console.log('Importing to testlogs directory...\n');

    // Ensure testlogs directory exists
    if (!fs.existsSync(TESTLOGS_DIR)) {
      fs.mkdirSync(TESTLOGS_DIR, { recursive: true });
    }

    let imported = 0;
    let deleted = 0;

    // Sort by modification time (oldest first)
    const logsWithStats = legacyLogs.map(filename => {
      const filepath = path.join(ROOT_DIR, filename);
      const stats = fs.statSync(filepath);
      return { filename, filepath, mtime: stats.mtime };
    }).sort((a, b) => a.mtime - b.mtime);

    for (const { filename, filepath, mtime } of logsWithStats) {
      try {
        // Extract timestamp from filename: test-timing-2025-10-10T19-15-36-704Z.log
        const match = filename.match(/test-timing-(.+)\.log$/);
        if (!match) {
          console.log(`⚠️  Skipping ${filename} (unexpected format)`);
          continue;
        }

        const timestamp = match[1];
        const content = fs.readFileSync(filepath, 'utf8');
        
        // Determine if this was a full test run (ALL) or specific suite
        // Check first few lines for suite indicator
        const lines = content.split('\n').slice(0, 10);
        let suiteName = 'ALL'; // Default to ALL for legacy logs
        
        // Try to infer suite from content
        if (content.includes('E2E/Puppeteer Tests:') && !content.includes('HTTP Server Tests:')) {
          suiteName = 'e2e';
        } else if (content.includes('testPathPattern') && content.includes('e2e-features')) {
          suiteName = 'e2e-quick';
        }
        
        // New filename format: timestamp_SUITENAME.log
        const newFilename = `${timestamp}_${suiteName}.log`;
        const newFilepath = path.join(TESTLOGS_DIR, newFilename);
        
        // Copy to testlogs directory (preserve original timestamp)
        fs.copyFileSync(filepath, newFilepath);
        fs.utimesSync(newFilepath, mtime, mtime);
        
        // Delete from root directory
        fs.unlinkSync(filepath);
        
        imported++;
        deleted++;
        console.log(`✓ Imported: ${filename} → testlogs/${newFilename}`);
      } catch (error) {
        console.error(`✗ Error importing ${filename}: ${error.message}`);
      }
    }

    console.log(`\n✅ Import complete: ${imported} files imported, ${deleted} files deleted from root\n`);
    
    return { imported, deleted };
  }

  /**
   * Load and parse all test logs from testlogs directory
   */
  loadLogs() {
    if (!fs.existsSync(TESTLOGS_DIR)) {
      console.log('📁 No testlogs directory found. Run tests first to generate logs.');
      return;
    }

    const files = fs.readdirSync(TESTLOGS_DIR)
      .filter(f => f.endsWith('.log'))
      .sort(); // Chronological order by timestamp in filename

    console.log(`📂 Loading ${files.length} test log files...\n`);

    for (const filename of files) {
      const filepath = path.join(TESTLOGS_DIR, filename);
      const log = this.parseLogFile(filepath, filename);
      if (log) {
        this.logs.push(log);
      }
    }

    // Build test history
    for (const log of this.logs) {
      for (const test of log.tests) {
        if (!this.testHistory.has(test.path)) {
          this.testHistory.set(test.path, []);
        }
        this.testHistory.get(test.path).push({
          timestamp: log.timestamp,
          suite: log.suite,
          ...test
        });
      }
    }

    console.log(`✓ Loaded ${this.logs.length} log files with ${this.testHistory.size} unique tests\n`);
  }

  /**
   * Parse a single log file
   */
  parseLogFile(filepath, filename) {
    try {
      const content = fs.readFileSync(filepath, 'utf8');
      const lines = content.split('\n');
      
      // Extract metadata from filename: 2025-10-10T19-15-36-704Z_e2e-quick.log
      const match = filename.match(/^(.+?)_(.+?)\.log$/);
      if (!match) {
        console.warn(`⚠️  Unexpected filename format: ${filename}`);
        return null;
      }

      const [, timestamp, suite] = match;
      
      // Parse test results section
      const tests = [];
      let inTestResults = false;
      
      for (const line of lines) {
        if (line.includes('All Test Results (sorted by runtime):')) {
          inTestResults = true;
          continue;
        }
        
        if (inTestResults && line.match(/^\d+\./)) {
          // Parse: "1. 33.35s - tests\e2e-features\telemetry-flow\preparation-stages.test.js (1 tests, 1 passed, 0 failed)"
          const testMatch = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
          if (testMatch) {
            const [, runtime, testPath, numTests, numPassing, numFailing] = testMatch;
            tests.push({
              path: testPath.replace(/\\/g, '/'), // Normalize path separators
              runtime: parseFloat(runtime),
              numTests: parseInt(numTests),
              numPassing: parseInt(numPassing),
              numFailing: parseInt(numFailing)
            });
          }
        }
      }

      return {
        filename,
        filepath,
        timestamp,
        suite,
        tests,
        date: new Date(timestamp.replace(/T/, ' ').replace(/-/g, ':').replace('Z', ''))
      };
    } catch (error) {
      console.error(`✗ Error parsing ${filename}: ${error.message}`);
      return null;
    }
  }

  /**
   * Analyze test status changes and identify fixes/regressions
   */
  analyzeChanges() {
    console.log('═'.repeat(80));
    console.log('🔍 TEST STATUS ANALYSIS');
    console.log('═'.repeat(80));
    console.log('');

    const fixes = [];
    const regressions = [];
    const stillBroken = [];
    const stillPassing = [];

    for (const [testPath, history] of this.testHistory.entries()) {
      if (history.length < 2) continue; // Need at least 2 data points

      // Sort by timestamp
      history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      
      const oldest = history[0];
      const newest = history[history.length - 1];

      // Determine status
      const wasFailingBefore = oldest.numFailing > 0;
      const isFailingNow = newest.numFailing > 0;

      if (wasFailingBefore && !isFailingNow) {
        fixes.push({ testPath, oldest, newest, history });
      } else if (!wasFailingBefore && isFailingNow) {
        regressions.push({ testPath, oldest, newest, history });
      } else if (wasFailingBefore && isFailingNow) {
        stillBroken.push({ testPath, oldest, newest, history });
      } else {
        stillPassing.push({ testPath, oldest, newest, history });
      }
    }

    // Display fixes
    if (fixes.length > 0) {
      console.log(`✅ FIXED TESTS (${fixes.length})`);
      console.log('─'.repeat(80));
      for (const { testPath, oldest, newest, history } of fixes.slice(0, 20)) {
        const firstFailed = oldest.timestamp.substring(0, 10);
        const fixedOn = newest.timestamp.substring(0, 10);
        const attempts = history.length;
        console.log(`  ✓ ${testPath}`);
        console.log(`    Was failing: ${firstFailed} (${oldest.numFailing} failures)`);
        console.log(`    Fixed: ${fixedOn} (attempts: ${attempts})`);
        console.log('');
      }
      if (fixes.length > 20) {
        console.log(`  ... and ${fixes.length - 20} more\n`);
      }
    }

    // Display regressions
    if (regressions.length > 0) {
      console.log(`❌ REGRESSIONS (${regressions.length})`);
      console.log('─'.repeat(80));
      for (const { testPath, oldest, newest } of regressions.slice(0, 10)) {
        const wasPassing = oldest.timestamp.substring(0, 10);
        const brokeOn = newest.timestamp.substring(0, 10);
        console.log(`  ⚠️  ${testPath}`);
        console.log(`    Was passing: ${wasPassing}`);
        console.log(`    Broke: ${brokeOn} (${newest.numFailing} failures)`);
        console.log('');
      }
    }

    // Display still broken (prioritized)
    if (stillBroken.length > 0) {
      console.log(`🔴 STILL BROKEN (${stillBroken.length})`);
      console.log('─'.repeat(80));
      
      // Sort by most recent attempt
      stillBroken.sort((a, b) => new Date(b.newest.timestamp) - new Date(a.newest.timestamp));
      
      for (const { testPath, oldest, newest, history } of stillBroken.slice(0, 15)) {
        const firstFailed = oldest.timestamp.substring(0, 10);
        const lastAttempt = newest.timestamp.substring(0, 10);
        const attempts = history.length;
        const runtime = newest.runtime;
        const emoji = runtime > 30 ? '🐌🐌🐌' : runtime > 10 ? '🐌🐌' : runtime > 5 ? '🐌' : '⏱️';
        
        console.log(`  ${emoji} ${testPath}`);
        console.log(`    First failed: ${firstFailed}`);
        console.log(`    Last attempt: ${lastAttempt} (attempts: ${attempts})`);
        console.log(`    Failures: ${newest.numFailing}/${newest.numTests} tests, Runtime: ${runtime.toFixed(1)}s`);
        console.log('');
      }
      if (stillBroken.length > 15) {
        console.log(`  ... and ${stillBroken.length - 15} more\n`);
      }
    }

    // Summary
    console.log('═'.repeat(80));
    console.log('📊 SUMMARY');
    console.log('═'.repeat(80));
    console.log(`  ✅ Fixed: ${fixes.length}`);
    console.log(`  ❌ Regressions: ${regressions.length}`);
    console.log(`  🔴 Still broken: ${stillBroken.length}`);
    console.log(`  ✓ Still passing: ${stillPassing.length}`);
    console.log(`  📈 Total tests tracked: ${this.testHistory.size}`);
    console.log('');

    return { fixes, regressions, stillBroken, stillPassing };
  }

  /**
   * Get current status of all tests from most recent logs
   */
  getCurrentStatus() {
    if (this.logs.length === 0) {
      console.log('❌ No test logs found. Run tests first.');
      return;
    }

    // Get most recent full test run (ALL suite)
    const fullRuns = this.logs.filter(log => log.suite === 'ALL').sort((a, b) => b.date - a.date);
    const latestFull = fullRuns[0];

    // Get most recent run for each suite type
    const latestBySuite = new Map();
    for (const log of this.logs) {
      if (!latestBySuite.has(log.suite) || log.date > latestBySuite.get(log.suite).date) {
        latestBySuite.set(log.suite, log);
      }
    }

    console.log('═'.repeat(80));
    console.log('📊 CURRENT TEST STATUS');
    console.log('═'.repeat(80));
    console.log('');

    if (latestFull) {
      console.log(`🔍 Latest Full Test Run: ${latestFull.timestamp.substring(0, 19)}`);
      console.log('─'.repeat(80));
      const passing = latestFull.tests.filter(t => t.numFailing === 0);
      const failing = latestFull.tests.filter(t => t.numFailing > 0);
      console.log(`  ✅ Passing: ${passing.length}`);
      console.log(`  ❌ Failing: ${failing.length}`);
      console.log(`  📋 Total: ${latestFull.tests.length}`);
      console.log('');
    }

    console.log('📦 Latest Run by Suite:');
    console.log('─'.repeat(80));
    for (const [suite, log] of latestBySuite.entries()) {
      const passing = log.tests.filter(t => t.numFailing === 0);
      const failing = log.tests.filter(t => t.numFailing > 0);
      const date = log.timestamp.substring(0, 19);
      console.log(`  ${suite.padEnd(20)} ${date}  ✅ ${passing.length}  ❌ ${failing.length}`);
    }
    console.log('');
  }

  /**
   * Show detailed status of a specific test
   */
  showTestHistory(testName) {
    const matches = [];
    for (const [testPath, history] of this.testHistory.entries()) {
      if (testPath.toLowerCase().includes(testName.toLowerCase())) {
        matches.push({ testPath, history });
      }
    }

    if (matches.length === 0) {
      console.log(`❌ No tests found matching: ${testName}`);
      return;
    }

    if (matches.length > 1) {
      console.log(`🔍 Found ${matches.length} matching tests:\n`);
      matches.forEach(({ testPath }) => console.log(`  - ${testPath}`));
      console.log('\nPlease be more specific.\n');
      return;
    }

    const { testPath, history } = matches[0];
    history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    console.log('═'.repeat(80));
    console.log(`📋 TEST HISTORY: ${testPath}`);
    console.log('═'.repeat(80));
    console.log('');

    for (const entry of history) {
      const status = entry.numFailing === 0 ? '✅ PASS' : '❌ FAIL';
      const emoji = entry.runtime > 30 ? '🐌🐌🐌' : entry.runtime > 10 ? '🐌🐌' : entry.runtime > 5 ? '🐌' : '⚡';
      console.log(`${status} ${entry.timestamp.substring(0, 19)} [${entry.suite.padEnd(15)}]`);
      console.log(`     ${emoji} ${entry.runtime.toFixed(2)}s | ${entry.numPassing}/${entry.numTests} passed, ${entry.numFailing} failed`);
      console.log('');
    }

    // Summary
    const firstRun = history[0];
    const lastRun = history[history.length - 1];
    const totalRuns = history.length;
    const passCount = history.filter(h => h.numFailing === 0).length;
    const failCount = history.filter(h => h.numFailing > 0).length;

    console.log('─'.repeat(80));
    console.log('Summary:');
    console.log(`  Total runs: ${totalRuns}`);
    console.log(`  Passed: ${passCount} (${((passCount/totalRuns)*100).toFixed(1)}%)`);
    console.log(`  Failed: ${failCount} (${((failCount/totalRuns)*100).toFixed(1)}%)`);
    console.log(`  Current status: ${lastRun.numFailing === 0 ? '✅ PASSING' : '❌ FAILING'}`);
    console.log('');
  }

  /**
   * Generate AI-friendly summary for documentation
   */
  generateAgentSummary() {
    console.log('═'.repeat(80));
    console.log('🤖 AI AGENT SUMMARY');
    console.log('═'.repeat(80));
    console.log('');
    console.log('This summary is optimized for AI agents working on test fixes.');
    console.log('');

    // Prioritized broken tests (by recency and frequency)
    const brokenTests = [];
    for (const [testPath, history] of this.testHistory.entries()) {
      history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      const latest = history[history.length - 1];
      if (latest.numFailing > 0) {
        const failureRate = history.filter(h => h.numFailing > 0).length / history.length;
        brokenTests.push({
          testPath,
          latest,
          attempts: history.length,
          failureRate,
          avgRuntime: history.reduce((sum, h) => sum + h.runtime, 0) / history.length
        });
      }
    }

    // Sort by failure rate (most consistently broken first), then by recent attempts
    brokenTests.sort((a, b) => {
      if (Math.abs(a.failureRate - b.failureRate) < 0.1) {
        return b.attempts - a.attempts; // More attempts = more attention
      }
      return b.failureRate - a.failureRate;
    });

    console.log('🎯 PRIORITY BROKEN TESTS (Fix These First):');
    console.log('─'.repeat(80));
    for (const { testPath, latest, attempts, failureRate, avgRuntime } of brokenTests.slice(0, 10)) {
      const emoji = avgRuntime > 30 ? '🐌🐌🐌' : avgRuntime > 10 ? '🐌🐌' : avgRuntime > 5 ? '🐌' : '⚠️';
      console.log(`${emoji} ${testPath}`);
      console.log(`   Failure rate: ${(failureRate * 100).toFixed(0)}% | Attempts: ${attempts} | Runtime: ${avgRuntime.toFixed(1)}s`);
      console.log(`   Failures: ${latest.numFailing}/${latest.numTests} tests`);
      console.log('');
    }

    // Recently fixed (learning opportunities)
    const fixes = [];
    for (const [testPath, history] of this.testHistory.entries()) {
      history.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
      if (history.length >= 2) {
        const latest = history[history.length - 1];
        const previous = history[history.length - 2];
        if (previous.numFailing > 0 && latest.numFailing === 0) {
          fixes.push({ testPath, fixedOn: latest.timestamp });
        }
      }
    }

    if (fixes.length > 0) {
      console.log('✅ RECENTLY FIXED (Learn from These):');
      console.log('─'.repeat(80));
      fixes.sort((a, b) => b.fixedOn.localeCompare(a.fixedOn));
      for (const { testPath, fixedOn } of fixes.slice(0, 5)) {
        console.log(`  ✓ ${testPath}`);
        console.log(`    Fixed: ${fixedOn.substring(0, 19)}`);
        console.log('');
      }
    }

    console.log('═'.repeat(80));
    console.log('');
  }
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  const analyzer = new TestLogAnalyzer();

  // Handle import command
  if (args.includes('--import')) {
    const result = analyzer.importLegacyLogs();
    if (result.imported === 0) {
      return;
    }
    console.log('To analyze the imported logs, run: node tests/analyze-test-logs.js\n');
    return;
  }

  // Load logs
  analyzer.loadLogs();

  if (analyzer.logs.length === 0) {
    console.log('');
    console.log('💡 TIP: Import legacy logs with: node tests/analyze-test-logs.js --import');
    console.log('');
    return;
  }

  // Handle specific test query
  const testIndex = args.indexOf('--test');
  if (testIndex !== -1 && args[testIndex + 1]) {
    analyzer.showTestHistory(args[testIndex + 1]);
    return;
  }

  // Handle summary flag
  if (args.includes('--summary')) {
    analyzer.getCurrentStatus();
    return;
  }

  // Handle verbose flag or default full analysis
  if (args.includes('--verbose') || args.length === 0) {
    analyzer.getCurrentStatus();
    console.log('');
    analyzer.analyzeChanges();
    console.log('');
    analyzer.generateAgentSummary();
  }
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { TestLogAnalyzer };
