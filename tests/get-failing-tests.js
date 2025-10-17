#!/usr/bin/env node
/**
 * Get Failing Tests - Failure discovery & history helper
 *
 * Usage:
 *   node tests/get-failing-tests.js                        # Latest failures (detailed)
 *   node tests/get-failing-tests.js unit                   # Latest unit failures
 *   node tests/get-failing-tests.js --count                # Count failing files (latest)
 *   node tests/get-failing-tests.js --simple               # Just file paths (latest)
 *   node tests/get-failing-tests.js --history              # Show last 5 runs (latest suite)
 *   node tests/get-failing-tests.js --history --logs 8     # Show last 8 runs
 *   node tests/get-failing-tests.js --history --test dbAccess.test.js
 *                                                         # Track one test across runs
 */

const fs = require('fs');
const path = require('path');

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');
const FAILURE_SUMMARY_PATH = path.join(__dirname, '..', 'test-failure-summary.json');
const DEFAULT_HISTORY_LOGS = 5;

function ensureTestlogsDir() {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    console.error('Error: testlogs directory not found');
    process.exit(1);
  }
}

function listLogPaths(suiteFilter, limit) {
  ensureTestlogsDir();
  const files = fs.readdirSync(TESTLOGS_DIR)
    .filter(name => name.endsWith('.log'))
    .filter(name => {
      if (!suiteFilter) return true;
      return name.includes(`_${suiteFilter}.log`);
    })
    .sort()
    .reverse();

  if (files.length === 0) {
    if (suiteFilter) {
      console.error(`Error: No test logs found for suite: ${suiteFilter}`);
    } else {
      console.error('Error: No test logs found');
    }
    process.exit(1);
  }

  const bounded = typeof limit === 'number' ? files.slice(0, limit) : files;
  return bounded.map(name => path.join(TESTLOGS_DIR, name));
}

function parseTestResults(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  const results = [];
  let inResultsSection = false;

  for (const line of lines) {
    if (line.includes('All Test Results')) {
      inResultsSection = true;
      continue;
    }

    if (!inResultsSection) continue;

    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) continue;

    const [, runtime, testPath, totalTests, passed, failed] = match;
    results.push({
      testPath: testPath.trim(),
      runtime: parseFloat(runtime),
      totalTests: parseInt(totalTests, 10),
      passed: parseInt(passed, 10),
      failed: parseInt(failed, 10)
    });
  }

  return results;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function loadJsonAsMap(payload) {
  const map = new Map();
  if (!payload || !Array.isArray(payload.failures)) {
    return map;
  }
  for (const entry of payload.failures) {
    if (!entry || !entry.filePath) continue;
    map.set(normalizePath(entry.filePath), entry);
  }
  return map;
}

function loadGlobalFailureSummary() {
  if (!fs.existsSync(FAILURE_SUMMARY_PATH)) {
    return new Map();
  }
  try {
    const payload = JSON.parse(fs.readFileSync(FAILURE_SUMMARY_PATH, 'utf8'));
    return loadJsonAsMap(payload);
  } catch (error) {
    console.warn('⚠️  Could not read test-failure-summary.json:', error.message);
    return new Map();
  }
}

function loadFailureSummaryForLog(logPath, globalFallback) {
  const baseName = path.basename(logPath, '.log');
  const historicalPath = path.join(TESTLOGS_DIR, `${baseName}.failures.json`);
  if (fs.existsSync(historicalPath)) {
    try {
      const payload = JSON.parse(fs.readFileSync(historicalPath, 'utf8'));
      return loadJsonAsMap(payload);
    } catch (error) {
      console.warn(`⚠️  Could not parse ${path.basename(historicalPath)}: ${error.message}`);
      return new Map();
    }
  }
  return globalFallback;
}

function formatTimestampFromLog(logPath) {
  const filename = path.basename(logPath, '.log');
  const match = filename.match(/^(.+?)_/);
  if (!match) {
    return filename;
  }
  const raw = match[1];
  const [datePart, timePartWithMillis] = raw.split('T');
  if (!timePartWithMillis) {
    return raw;
  }
  const timeSegments = timePartWithMillis.replace('Z', '').split('-');
  const millis = timeSegments.pop();
  const timePart = timeSegments.join(':');
  return `${datePart} ${timePart}.${millis}Z`;
}

function getSuiteFromLogPath(logPath) {
  const filename = path.basename(logPath, '.log');
  const parts = filename.split('_');
  return parts.length > 1 ? parts[parts.length - 1] : 'unknown';
}

function failureMessageFor(testPath, failureSummaryMap) {
  const entry = failureSummaryMap.get(normalizePath(testPath));
  if (!entry || !Array.isArray(entry.entries) || entry.entries.length === 0) {
    return null;
  }
  const detail = entry.entries[0];
  return detail && detail.message ? detail.message : null;
}

function printLatestFailures(logPath, results, mode, failureSummaryMap) {
  const failures = results.filter(result => result.failed > 0);

  if (mode === 'count') {
    console.log(failures.length);
    return failures.length;
  }

  if (mode === 'simple') {
    failures.forEach(f => console.log(f.testPath));
    return failures.length;
  }

  if (failures.length === 0) {
    console.log('✅ No failing tests found');
    return 0;
  }

  console.log(`\nLog: ${path.basename(logPath)} (${formatTimestampFromLog(logPath)})\n`);
  console.log(`❌ Found ${failures.length} test file(s) with failures:\n`);

  failures.forEach((failure, index) => {
    console.log(`${index + 1}. ${failure.testPath}`);
    console.log(`   Runtime: ${failure.runtime}s | Failed: ${failure.failed}/${failure.totalTests} tests`);
    const message = failureMessageFor(failure.testPath, failureSummaryMap);
    if (message) {
      console.log(`   Latest failure: ${message}`);
    }
    console.log('');
  });

  return failures.length;
}

function printHistory(logPaths, options) {
  const { testPattern, globalSummaryMap } = options;
  const normalizedPattern = testPattern ? testPattern.toLowerCase() : null;

  const headerSuffix = testPattern
    ? ` for pattern "${testPattern}"`
    : '';
  console.log(`\n📜 History (last ${logPaths.length} run${logPaths.length === 1 ? '' : 's'})${headerSuffix}:\n`);

  logPaths.forEach((logPath, index) => {
    const when = formatTimestampFromLog(logPath);
    const suite = getSuiteFromLogPath(logPath);
    const results = parseTestResults(logPath);
    const failureSummaryMap = loadFailureSummaryForLog(logPath, globalSummaryMap);
    const failures = results.filter(r => r.failed > 0);

    console.log(`${index + 1}. ${when} [${suite}]`);

    if (normalizedPattern) {
      const matches = results.filter(r => normalizePath(r.testPath).toLowerCase().includes(normalizedPattern));
      if (matches.length === 0) {
        console.log('   • Test not present in this run');
        console.log('');
        return;
      }

      matches.forEach(match => {
        const statusIcon = match.failed > 0 ? '❌' : '✅';
        const runtime = Number.isFinite(match.runtime) ? `${match.runtime.toFixed(2)}s` : `${match.runtime}s`;
        const line = `   ${statusIcon} ${match.testPath} (${match.passed}/${match.totalTests} passed, runtime ${runtime})`;
        console.log(line);
        if (match.failed > 0) {
          const message = failureMessageFor(match.testPath, failureSummaryMap);
          if (message) {
            console.log(`      ↳ ${message}`);
          }
        }
      });
      console.log('');
      return;
    }

    if (failures.length === 0) {
      console.log('   ✅ No failing tests');
      console.log('');
      return;
    }

    failures.forEach(failure => {
      const runtime = Number.isFinite(failure.runtime) ? `${failure.runtime.toFixed(2)}s` : `${failure.runtime}s`;
      console.log(`   ❌ ${failure.testPath} — failed ${failure.failed}/${failure.totalTests} (runtime ${runtime})`);
      const message = failureMessageFor(failure.testPath, failureSummaryMap);
      if (message) {
        console.log(`      ↳ ${message}`);
      }
    });
    console.log('');
  });
}

// Parse arguments
const args = process.argv.slice(2);
let suiteFilter = null;
let mode = 'detailed';
let historyMode = false;
let logsCount = 1;
let logsExplicit = false;
let testPattern = null;

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i];
  if (arg === '--count') {
    mode = 'count';
  } else if (arg === '--simple') {
    mode = 'simple';
  } else if (arg === '--history') {
    historyMode = true;
  } else if (arg === '--logs') {
    const next = args[i + 1];
    if (!next || Number.isNaN(Number.parseInt(next, 10))) {
      console.error('Error: --logs requires a numeric value');
      process.exit(1);
    }
    logsCount = Math.max(1, Number.parseInt(next, 10));
    logsExplicit = true;
    i += 1;
  } else if (arg.startsWith('--logs=')) {
    const value = arg.split('=')[1];
    logsCount = Math.max(1, Number.parseInt(value, 10) || 1);
    logsExplicit = true;
  } else if (arg === '--test') {
    const next = args[i + 1];
    if (!next) {
      console.error('Error: --test requires a value');
      process.exit(1);
    }
    testPattern = next;
    i += 1;
  } else if (arg.startsWith('--test=')) {
    testPattern = arg.split('=')[1];
  } else if (!arg.startsWith('--')) {
    suiteFilter = arg;
  }
}

const availableLogs = listLogPaths(suiteFilter, undefined);

if ((historyMode || testPattern) && !logsExplicit) {
  logsCount = Math.min(DEFAULT_HISTORY_LOGS, availableLogs.length);
} else {
  logsCount = Math.min(logsCount, availableLogs.length);
}

const logPaths = availableLogs.slice(0, logsCount);
const globalSummaryMap = loadGlobalFailureSummary();

// Determine whether to show history or just latest
if (historyMode || logsCount > 1 || testPattern) {
  printHistory(logPaths, { testPattern, globalSummaryMap });
} else {
  const latestLogPath = logPaths[0];
  const latestResults = parseTestResults(latestLogPath);
  const latestFailureSummary = loadFailureSummaryForLog(latestLogPath, globalSummaryMap);
  const failureCount = printLatestFailures(latestLogPath, latestResults, mode, latestFailureSummary);
  process.exit(failureCount > 0 ? 1 : 0);
}

// Exit code reflects latest run status even when showing history
const latestResults = parseTestResults(logPaths[0]);
const latestFailures = latestResults.some(result => result.failed > 0);
process.exit(latestFailures ? 1 : 0);
