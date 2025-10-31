#!/usr/bin/env node
'use strict';
/**
 * Get Failing Tests — Failure discovery & history helper
 *
 * Usage:
 *   node tests/get-failing-tests.js                        # Latest failures (detailed ASCII)
 *   node tests/get-failing-tests.js unit                   # Latest unit failures
 *   node tests/get-failing-tests.js --count                # Count failing files
 *   node tests/get-failing-tests.js --simple               # Just failing file paths
 *   node tests/get-failing-tests.js --json                 # Emit JSON payload (latest)
 *   node tests/get-failing-tests.js --history              # Show recent history (default 5 logs)
 *   node tests/get-failing-tests.js --history --logs 8     # History across 8 logs
 *   node tests/get-failing-tests.js --history --test dbAccess.test.js
 *                                                         # Track one test across runs
 */

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');
const FAILURE_SUMMARY_PATH = path.join(__dirname, '..', 'test-failure-summary.json');
const TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}T/;
const DEFAULT_HISTORY_LOGS = 5;

function createParser() {
  const parser = new CliArgumentParser(
    'get-failing-tests',
    'Inspect failing Jest tests without rerunning the suite.'
  );

  parser
    .add('--suite <name>', 'Limit to a specific suite (unit, e2e, all)')
    .add('--count', 'Emit only failing file count', false, 'boolean')
    .add('--simple', 'Emit only failing file paths', false, 'boolean')
    .add('--history', 'Show failure history across recent logs', false, 'boolean')
    .add('--logs <count>', 'Number of logs to inspect in history mode', undefined, 'number')
    .add('--test <pattern>', 'Focus history on a single test path or pattern')
    .add('--json', 'Alias for --summary-format json', false, 'boolean')
    .add('--summary-format <mode>', 'Output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII output when using JSON summary', false, 'boolean');

  return parser;
}

function normalizeOptions(rawOptions) {
  const positional = Array.isArray(rawOptions.positional) ? rawOptions.positional : [];
  const filteredPositional = positional.filter((value) => {
    if (!value) return false;
    const normalized = value.toString();
    return normalized !== process.argv[0] && normalized !== process.argv[1];
  });

  const suiteFilter = rawOptions.suite || filteredPositional[0] || null;

  const mode = rawOptions.count ? 'count' : rawOptions.simple ? 'simple' : 'detailed';

  let summaryFormat = rawOptions.summaryFormat;
  if (rawOptions.json) {
    summaryFormat = 'json';
  }
  summaryFormat = typeof summaryFormat === 'string' ? summaryFormat.trim().toLowerCase() : 'ascii';

  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${rawOptions.summaryFormat}`);
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json' && mode === 'detailed') {
    throw new CliError('Quiet mode requires JSON summary output. Use --summary-format json or --json.');
  }

  const historyMode = Boolean(rawOptions.history);
  const testPattern = rawOptions.test ? String(rawOptions.test) : null;

  const logsValue = rawOptions.logs;
  if (logsValue !== undefined && (!Number.isFinite(logsValue) || logsValue <= 0)) {
    throw new CliError('Logs count must be a positive number.');
  }

  const defaultLogs = historyMode || testPattern ? DEFAULT_HISTORY_LOGS : 1;
  const logsCount = Math.max(1, logsValue !== undefined ? logsValue : defaultLogs);

  return {
    suiteFilter,
    mode,
    summaryFormat,
    quiet,
    historyMode,
    logsCount,
    testPattern,
  };
}

function ensureTestlogsDir() {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    throw new CliError('testlogs directory not found.');
  }
}

function listLogPaths(suiteFilter) {
  ensureTestlogsDir();
  const normalizedSuite = suiteFilter ? suiteFilter.toLowerCase() : null;
  const files = fs.readdirSync(TESTLOGS_DIR)
    .filter((name) => name.endsWith('.log'))
    .filter((name) => {
      if (!normalizedSuite) return true;
      return name.toLowerCase().includes(`_${normalizedSuite}.log`);
    });

  if (files.length === 0) {
    if (suiteFilter) {
      throw new CliError(`No test logs found for suite: ${suiteFilter}`);
    }
    throw new CliError('No test logs found.');
  }

  const timestamped = files.filter((name) => TIMESTAMP_PATTERN.test(name));
  const prioritised = (timestamped.length > 0 ? timestamped : files)
    .slice()
    .sort()
    .reverse();

  return prioritised.map((name) => path.join(TESTLOGS_DIR, name));
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

    const match = line.match(/^(\d+)\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) continue;

    const [, , runtime, testPath, totalTests, passed, failed] = match;
    results.push({
      testPath: normalizePath(testPath.trim()),
      runtime: Number.parseFloat(runtime),
      totalTests: Number.parseInt(totalTests, 10),
      passed: Number.parseInt(passed, 10),
      failed: Number.parseInt(failed, 10),
      fromSummary: false,
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
    fmt.warn(`Could not read test-failure-summary.json: ${error.message}`);
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
      fmt.warn(`Could not parse ${path.basename(historicalPath)}: ${error.message}`);
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
    fromSummary: true,
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
  const directFailures = results.filter((result) => result.failed > 0);
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

function enrichFailureRecords(failures, failureSummaryMap) {
  return failures.map((record, index) => {
    const message = failureMessageFor(record.testPath, failureSummaryMap);
    const failed = Number.isFinite(record.failed) ? record.failed : null;
    const totalTests = Number.isFinite(record.totalTests) ? record.totalTests : null;
    let passed = Number.isFinite(record.passed) ? record.passed : null;
    if (passed === null && totalTests != null && failed != null) {
      passed = Math.max(0, totalTests - failed);
    }

    return {
      index: index + 1,
      testPath: record.testPath,
      runtimeSeconds: Number.isFinite(record.runtime) ? record.runtime : null,
      runtimeDisplay: formatRuntime(record.runtime),
      failed,
      totalTests,
      passed,
      failureLabel: formatFailureTotals(record),
      message: message || null,
      source: record.fromSummary ? 'summary' : 'log',
    };
  });
}

function buildLatestReport(logPath, results, failureSummaryMap) {
  const { records, usedSummary } = collectFailureRecords(results, failureSummaryMap);
  const failures = enrichFailureRecords(records, failureSummaryMap);

  return {
    logPath,
    logName: path.basename(logPath),
    timestamp: formatTimestampFromLog(logPath),
    suite: getSuiteFromLogPath(logPath),
    usedSummary,
    failureCount: failures.length,
    failures,
  };
}

function renderLatestAscii(report) {
  fmt.header('Latest Failing Tests');
  fmt.settings(`Log: ${report.logName} (${report.timestamp})`);
  fmt.settings(`Suite: ${report.suite}`);

  const stats = {
    'Failing files': report.failureCount,
  };
  if (report.usedSummary) {
    stats['Failure source'] = 'failure summary snapshot';
  }
  fmt.summary(stats);

  if (report.failureCount === 0) {
    fmt.success('No failing tests found.');
    fmt.footer();
    return;
  }

  fmt.section('Failures');
  fmt.table(
    report.failures.map((failure) => ({
      '#': failure.index,
      'Test file': failure.testPath,
      'Failures': failure.failureLabel,
      'Runtime': failure.runtimeDisplay,
      'Source': failure.source === 'summary' ? 'summary snapshot' : 'log',
    })),
    { columns: ['#', 'Test file', 'Failures', 'Runtime', 'Source'] },
  );

  const failuresWithMessages = report.failures.filter((failure) => failure.message);
  if (failuresWithMessages.length > 0) {
    fmt.section('Latest Failure Messages');
    fmt.list(
      'Messages',
      failuresWithMessages.map((failure) => `#${failure.index} ${failure.testPath} — ${failure.message}`),
    );
  }

  fmt.footer();
}

function buildLatestJson(report, options) {
  return {
    mode: options.mode,
    suiteFilter: options.suiteFilter,
    logPath: report.logPath,
    logName: report.logName,
    timestamp: report.timestamp,
    suite: report.suite,
    usedSummary: report.usedSummary,
    failureCount: report.failureCount,
    failures: report.failures.map((failure) => ({
      index: failure.index,
      testPath: failure.testPath,
      runtimeSeconds: failure.runtimeSeconds,
      failed: failure.failed,
      passed: failure.passed,
      totalTests: failure.totalTests,
      failureLabel: failure.failureLabel,
      message: failure.message,
      source: failure.source,
    })),
  };
}

function emitLatestReport(report, options) {
  if (options.mode === 'count') {
    if (options.summaryFormat === 'json') {
      console.log(
        JSON.stringify(
          {
            mode: 'count',
            suiteFilter: options.suiteFilter,
            failureCount: report.failureCount,
            logPath: report.logPath,
            logName: report.logName,
            timestamp: report.timestamp,
            suite: report.suite,
          },
          null,
          options.quiet ? undefined : 2,
        ),
      );
    } else {
      console.log(report.failureCount);
    }
    return report.failureCount;
  }

  if (options.mode === 'simple') {
    if (options.summaryFormat === 'json') {
      console.log(
        JSON.stringify(
          {
            mode: 'simple',
            suiteFilter: options.suiteFilter,
            logPath: report.logPath,
            logName: report.logName,
            timestamp: report.timestamp,
            suite: report.suite,
            failures: report.failures.map((failure) => ({
              testPath: failure.testPath,
              failureLabel: failure.failureLabel,
              runtimeSeconds: failure.runtimeSeconds,
              message: failure.message,
              source: failure.source,
            })),
          },
          null,
          options.quiet ? undefined : 2,
        ),
      );
    } else {
      report.failures.forEach((failure) => console.log(failure.testPath));
    }
    return report.failureCount;
  }

  if (options.summaryFormat === 'json') {
    console.log(JSON.stringify(buildLatestJson(report, options), null, options.quiet ? undefined : 2));
    return report.failureCount;
  }

  renderLatestAscii(report);
  return report.failureCount;
}

function buildHistoryReport(logPaths, options, globalSummaryMap) {
  const normalizedPattern = options.testPattern ? options.testPattern.toLowerCase() : null;

  const runs = logPaths.map((logPath, index) => {
    const results = parseTestResults(logPath);
    const failureSummaryMap = loadFailureSummaryForLog(logPath, globalSummaryMap);
    const summaryRecords = mapFailureSummaryToRecords(failureSummaryMap);
    const { records, usedSummary } = collectFailureRecords(results, failureSummaryMap);
    const failures = enrichFailureRecords(records, failureSummaryMap);

    let patternDetails = null;
    if (normalizedPattern) {
      const matches = results
        .filter((result) => normalizePath(result.testPath).toLowerCase().includes(normalizedPattern))
        .map((result) => ({
          testPath: result.testPath,
          status: result.failed > 0 ? 'fail' : 'pass',
          runtimeSeconds: Number.isFinite(result.runtime) ? result.runtime : null,
          runtimeDisplay: formatRuntime(result.runtime),
          passed: Number.isFinite(result.passed) ? result.passed : null,
          totalTests: Number.isFinite(result.totalTests) ? result.totalTests : null,
          failed: Number.isFinite(result.failed) ? result.failed : null,
          message: result.failed > 0 ? failureMessageFor(result.testPath, failureSummaryMap) : null,
          source: 'log',
        }));

      const summaryMatches = summaryRecords
        .filter((record) => record.testPath.toLowerCase().includes(normalizedPattern))
        .map((record) => ({
          testPath: record.testPath,
          status: 'fail',
          runtimeSeconds: Number.isFinite(record.runtime) ? record.runtime : null,
          runtimeDisplay: formatRuntime(record.runtime),
          passed: Number.isFinite(record.passed) ? record.passed : null,
          totalTests: Number.isFinite(record.totalTests) ? record.totalTests : null,
          failed: Number.isFinite(record.failed) ? record.failed : null,
          message: failureMessageFor(record.testPath, failureSummaryMap),
          source: 'summary',
        }));

      patternDetails = {
        pattern: options.testPattern,
        present: matches.length > 0 || summaryMatches.length > 0,
        matches,
        summaryMatches,
      };
    }

    return {
      index: index + 1,
      logPath,
      logName: path.basename(logPath),
      timestamp: formatTimestampFromLog(logPath),
      suite: getSuiteFromLogPath(logPath),
      failureCount: failures.length,
      usedSummary,
      failures,
      patternDetails,
    };
  });

  return {
    mode: 'history',
    suiteFilter: options.suiteFilter,
    logsInspected: logPaths.length,
    testPattern: options.testPattern,
    runs,
  };
}

function renderHistoryAscii(history, options) {
  fmt.header('Failure History');

  const summaryStats = {
    'Runs inspected': history.logsInspected,
    'Suite filter': history.suiteFilter || 'all',
  };
  if (options.testPattern) {
    summaryStats['Test pattern'] = options.testPattern;
  }
  fmt.summary(summaryStats);

  history.runs.forEach((run) => {
    fmt.section(`${run.index}. ${run.timestamp} [${run.suite}]`);

    if (run.patternDetails) {
      if (!run.patternDetails.present) {
        fmt.warn('Test not present in this run.');
        fmt.blank();
        return;
      }

      const matchLines = [];
      run.patternDetails.matches.forEach((match) => {
        const icon = match.status === 'fail' ? '❌' : '✅';
        const base = `${icon} ${match.testPath} (${match.passed}/${match.totalTests} passed, runtime ${match.runtimeDisplay})`;
        matchLines.push(match.message ? `${base} — ${match.message}` : base);
      });

      run.patternDetails.summaryMatches.forEach((match) => {
        const base = `❌ ${match.testPath} (${match.failed || 'unknown'} failures, runtime ${match.runtimeDisplay}) [summary snapshot]`;
        matchLines.push(match.message ? `${base} — ${match.message}` : base);
      });

      fmt.list('Results', matchLines);
      fmt.blank();
      return;
    }

    if (run.failureCount === 0) {
      fmt.success('No failing tests.');
      fmt.blank();
      return;
    }

    fmt.stat('Failing files', run.failureCount);
    if (run.usedSummary) {
      fmt.info('Failure data sourced from summary snapshot (log missing structured list).');
    }

    const failureLines = run.failures.map((failure) => {
      const sourceLabel = failure.source === 'summary' ? ' [summary snapshot]' : '';
      const base = `${failure.index}. ${failure.testPath} — ${failure.failureLabel} (runtime ${failure.runtimeDisplay})${sourceLabel}`;
      return failure.message ? `${base} — ${failure.message}` : base;
    });
    fmt.list('Failures', failureLines);
    fmt.blank();
  });

  fmt.footer();
}

function buildHistoryJson(history) {
  return {
    mode: 'history',
    suiteFilter: history.suiteFilter,
    logsInspected: history.logsInspected,
    testPattern: history.testPattern,
    runs: history.runs.map((run) => ({
      index: run.index,
      logPath: run.logPath,
      logName: run.logName,
      timestamp: run.timestamp,
      suite: run.suite,
      failureCount: run.failureCount,
      usedSummary: run.usedSummary,
      failures: run.failures.map((failure) => ({
        index: failure.index,
        testPath: failure.testPath,
        runtimeSeconds: failure.runtimeSeconds,
        failed: failure.failed,
        passed: failure.passed,
        totalTests: failure.totalTests,
        failureLabel: failure.failureLabel,
        message: failure.message,
        source: failure.source,
      })),
      patternDetails: run.patternDetails
        ? {
            pattern: run.patternDetails.pattern,
            present: run.patternDetails.present,
            matches: run.patternDetails.matches,
            summaryMatches: run.patternDetails.summaryMatches,
          }
        : null,
    })),
  };
}

function emitHistoryReport(history, options) {
  if (options.summaryFormat === 'json') {
    console.log(JSON.stringify(buildHistoryJson(history), null, options.quiet ? undefined : 2));
  } else {
    renderHistoryAscii(history, options);
  }

  const latestRun = history.runs[0];
  return latestRun ? latestRun.failureCount : 0;
}

function main() {
  const parser = createParser();

  let rawArgs;
  try {
    rawArgs = parser.parse(process.argv);
  } catch (error) {
    fmt.error(error.message);
    process.exit(1);
  }

  let options;
  try {
    options = normalizeOptions(rawArgs);
  } catch (error) {
    if (error instanceof CliError) {
      fmt.error(error.message);
      process.exit(error.exitCode);
    }
    fmt.error(error.message);
    process.exit(1);
  }

  try {
    const availableLogs = listLogPaths(options.suiteFilter);
    const logPaths = availableLogs.slice(0, Math.min(options.logsCount, availableLogs.length));
    if (logPaths.length === 0) {
      throw new CliError('No test logs available after filtering.');
    }

    const globalSummaryMap = loadGlobalFailureSummary();

    if (options.historyMode || options.testPattern || logPaths.length > 1) {
      const historyReport = buildHistoryReport(logPaths, options, globalSummaryMap);
      const failureCount = emitHistoryReport(historyReport, options);
      process.exit(failureCount > 0 ? 1 : 0);
    }

    const latestLogPath = logPaths[0];
    const latestResults = parseTestResults(latestLogPath);
    const latestFailureSummary = loadFailureSummaryForLog(latestLogPath, globalSummaryMap);
    const latestReport = buildLatestReport(latestLogPath, latestResults, latestFailureSummary);
    const failureCount = emitLatestReport(latestReport, options);
    process.exit(failureCount > 0 ? 1 : 0);
  } catch (error) {
    if (error instanceof CliError) {
      fmt.error(error.message);
      process.exit(error.exitCode || 1);
    }
    fmt.error(error.message);
    if (process.env.DEBUG_CLI === '1') {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
