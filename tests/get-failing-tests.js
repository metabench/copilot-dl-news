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
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const DEFAULT_HISTORY_LOGS = 5;

function ensureTestlogsDir() {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    console.error('Error: testlogs directory not found');
    process.exit(1);
  }
}

function listLogPaths(suiteFilter, limit) {
  ensureTestlogsDir();
  const normalizedSuite = suiteFilter ? suiteFilter.toLowerCase() : null;
  const files = fs.readdirSync(TESTLOGS_DIR)
    .filter(name => name.endsWith('.log'))
    .filter(name => {
      if (!normalizedSuite) return true;
      return name.toLowerCase().includes(`_${normalizedSuite}.log`);
    });

  if (files.length === 0) {
    if (suiteFilter) {
      console.error(`Error: No test logs found for suite: ${suiteFilter}`);
    } else {
      console.error('Error: No test logs found');
    }
    process.exit(1);
  }

  const timestamped = files.filter(name => TIMESTAMP_PATTERN.test(name));
  const prioritised = (timestamped.length > 0 ? timestamped : files)
    .slice()
    .sort()
    .reverse();

  const bounded = typeof limit === 'number' ? prioritised.slice(0, limit) : prioritised;
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
      testPath: normalizePath(testPath.trim()),
      runtime: parseFloat(runtime),
      totalTests: parseInt(totalTests, 10),
      passed: parseInt(passed, 10),
      failed: parseInt(failed, 10),
      fromSummary: false
    });
  }

  return results;
}

function normalizePath(value) {
  return (value || '').replace(/\\/g, '/');
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

function buildFailureRecordFromSummary(entry) {
  if (!entry) return null;
  const failed = Number.isFinite(entry.numFailing)
    ? entry.numFailing
    : Array.isArray(entry.entries)
      ? entry.entries.length
      : 0;
  if (!failed || failed <= 0) {
    return null;
  }

  const totalTests = Number.isFinite(entry.numTests) ? entry.numTests : null;
  const passed = Number.isFinite(entry.numPassing)
    ? entry.numPassing
    : (totalTests != null ? Math.max(0, totalTests - failed) : null);
  const runtime = Number.isFinite(entry.runtime) ? entry.runtime : null;
  const testPath = normalizePath(entry.filePath || entry.testPath || '');
  if (!testPath) {
    return null;
  }

  return {
    testPath,
    runtime,
    totalTests,
    passed,
    failed,
    fromSummary: true
  };
}

function mapFailureSummaryToRecords(failureSummaryMap) {
  if (!failureSummaryMap || failureSummaryMap.size === 0) {
    return [];
  }
  const records = [];
  for (const entry of failureSummaryMap.values()) {
    const record = buildFailureRecordFromSummary(entry);
    if (record) {
      records.push(record);
    }
  }
  return records;
}

function collectFailureRecords(results, failureSummaryMap) {
  const directFailures = results.filter(result => result.failed > 0);
  if (directFailures.length > 0) {
    return { records: directFailures, usedSummary: false };
  }

  const summaryRecords = mapFailureSummaryToRecords(failureSummaryMap);
  if (summaryRecords.length > 0) {
    return { records: summaryRecords, usedSummary: true };
  }

  return { records: [], usedSummary: false };
}

function formatRuntime(runtime) {
  if (Number.isFinite(runtime)) {
    return `${runtime.toFixed(2)}s`;
  }
  return 'unknown';
}

function formatFailureTotals(record) {
  if (Number.isFinite(record.failed) && Number.isFinite(record.totalTests)) {
    return `${record.failed}/${record.totalTests} tests`;
  }
  if (Number.isFinite(record.failed)) {
    return `${record.failed} failure${record.failed === 1 ? '' : 's'}`;
  }
  return 'unknown failures';
}

function printLatestFailures(logPath, results, mode, failureSummaryMap) {
  const { records: failures, usedSummary } = collectFailureRecords(results, failureSummaryMap);

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
    console.log(`   Runtime: ${formatRuntime(failure.runtime)} | Failed: ${formatFailureTotals(failure)}`);
    const message = failureMessageFor(failure.testPath, failureSummaryMap);
    if (message) {
      console.log(`   Latest failure: ${message}`);
    }
    if (usedSummary && failure.fromSummary) {
      console.log('   ℹ️  Source: failure summary snapshot (log missing structured test list)');
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
    const summaryRecords = mapFailureSummaryToRecords(failureSummaryMap);
    const { records: failures, usedSummary } = collectFailureRecords(results, failureSummaryMap);

    console.log(`${index + 1}. ${when} [${suite}]`);

    if (normalizedPattern) {
      const matches = results.filter(r => normalizePath(r.testPath).toLowerCase().includes(normalizedPattern));
      const summaryMatches = summaryRecords.filter(r => r.testPath.toLowerCase().includes(normalizedPattern));

      if (matches.length === 0 && summaryMatches.length === 0) {
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

      if (matches.length === 0 && summaryMatches.length > 0) {
        summaryMatches.forEach(match => {
          const runtime = formatRuntime(match.runtime);
          console.log(`   ❌ ${match.testPath} (failures: ${formatFailureTotals(match)}, runtime ${runtime})`);
          const message = failureMessageFor(match.testPath, failureSummaryMap);
          if (message) {
            console.log(`      ↳ ${message}`);
          }
          console.log('      ℹ️  Source: failure summary snapshot (log missing structured test list)');
        });
      }
      console.log('');
      return;
    }

    if (failures.length === 0) {
      console.log('   ✅ No failing tests');
      console.log('');
      return;
    }

    failures.forEach(failure => {
      const runtime = formatRuntime(failure.runtime);
      const failureTotals = formatFailureTotals(failure);
      console.log(`   ❌ ${failure.testPath} — failed ${failureTotals} (runtime ${runtime})`);
      const message = failureMessageFor(failure.testPath, failureSummaryMap);
      if (message) {
        console.log(`      ↳ ${message}`);
      }
      if (usedSummary && failure.fromSummary) {
        console.log('      ℹ️  Source: failure summary snapshot (log missing structured test list)');
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
const latestFailureSummary = loadFailureSummaryForLog(logPaths[0], globalSummaryMap);
const latestFailures = collectFailureRecords(latestResults, latestFailureSummary).records.length > 0;
process.exit(latestFailures ? 1 : 0);
