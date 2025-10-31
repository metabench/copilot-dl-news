#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { CliFormatter } = require('../src/utils/CliFormatter');
const { CliArgumentParser } = require('../src/utils/CliArgumentParser');
const {
  findLatestLogEntry,
  buildLatestLogJson,
  TESTLOGS_DIR,
} = require('./get-latest-log.js');

class CliError extends Error {
  constructor(message, exitCode = 1) {
    super(message);
    this.exitCode = exitCode;
  }
}

const fmt = new CliFormatter();
const DEFAULT_THRESHOLD_SECONDS = 5;

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

function createParser() {
  const parser = new CliArgumentParser(
    'get-slow-tests',
    'List tests exceeding a runtime threshold using data from the latest Jest log.'
  );

  parser
    .add('--suite <name>', 'Suite filter (unit, e2e, integration, all)')
    .add('--threshold <seconds>', 'Runtime threshold in seconds (default: 5)', undefined)
    .add('--count', 'Output only the number of slow tests', false, 'boolean')
    .add('--json', 'Emit JSON summary (alias for --summary-format json)', false, 'boolean')
    .add('--summary-format <mode>', 'Summary output format: ascii | json', 'ascii')
    .add('--quiet', 'Suppress ASCII output and emit JSON only', false, 'boolean');

  return parser;
}

function normalizeOptions(rawOptions) {
  const positional = Array.isArray(rawOptions.positional) ? rawOptions.positional : [];
  const filteredPositional = positional.filter((value) => {
    if (!value) return false;
    const normalized = value.toString();
    return normalized !== process.argv[0] && normalized !== process.argv[1];
  });

  let threshold = DEFAULT_THRESHOLD_SECONDS;
  let suiteFilter = null;

  if (rawOptions.threshold !== undefined) {
    threshold = parseFloat(rawOptions.threshold);
  }

  for (const value of filteredPositional) {
    if (!Number.isNaN(parseFloat(value)) && threshold === DEFAULT_THRESHOLD_SECONDS && rawOptions.threshold === undefined) {
      threshold = parseFloat(value);
    } else if (!value.startsWith('--') && suiteFilter === null) {
      suiteFilter = value;
    }
  }

  if (rawOptions.suite) {
    suiteFilter = rawOptions.suite;
  }

  if (!Number.isFinite(threshold) || threshold <= 0) {
    throw new CliError(`Invalid threshold: ${rawOptions.threshold ?? filteredPositional[0]}`);
  }

  let summaryFormat = rawOptions.summaryFormat;
  if (rawOptions.json) {
    summaryFormat = 'json';
  }
  if (typeof summaryFormat === 'string') {
    summaryFormat = summaryFormat.trim().toLowerCase();
  } else {
    summaryFormat = 'ascii';
  }
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${rawOptions.summaryFormat}`);
  }

  const quiet = Boolean(rawOptions.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('Quiet mode requires JSON output. Use --json or --summary-format json.');
  }

  const mode = rawOptions.count ? 'count' : 'detail';

  return {
    threshold,
    suiteFilter,
    summaryFormat,
    quiet,
    mode,
  };
}

function loadLogContent(logPath) {
  try {
    return fs.readFileSync(logPath, 'utf8');
  } catch (error) {
    throw new CliError(`Unable to read log file at ${logPath}`);
  }
}

function parseSlowTests(content, thresholdSeconds) {
  const lines = content.split('\n');
  const slowTests = [];
  let sectionFound = false;

  for (const line of lines) {
    if (!sectionFound) {
      if (line.includes('All Test Results')) {
        sectionFound = true;
      }
      continue;
    }

    const match = line.match(/^\s*\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) {
      continue;
    }

    const [, runtime, testPath, totalTests, passed, failed] = match;
    const runtimeNum = parseFloat(runtime);
    if (!Number.isFinite(runtimeNum)) {
      continue;
    }

    if (runtimeNum >= thresholdSeconds) {
      slowTests.push({
        testPath: testPath.trim(),
        runtime: runtimeNum,
        totalTests: Number.parseInt(totalTests, 10),
        passed: Number.parseInt(passed, 10),
        failed: Number.parseInt(failed, 10),
      });
    }
  }

  slowTests.sort((a, b) => b.runtime - a.runtime);

  return { slowTests, sectionFound };
}

function computeStats(slowTests) {
  if (!slowTests.length) {
    return {
      count: 0,
      maxRuntime: null,
      minRuntime: null,
      avgRuntime: null,
    };
  }

  const runtimes = slowTests.map((t) => t.runtime);
  const total = runtimes.reduce((sum, value) => sum + value, 0);
  return {
    count: slowTests.length,
    maxRuntime: Math.max(...runtimes),
    minRuntime: Math.min(...runtimes),
    avgRuntime: total / slowTests.length,
  };
}

function formatSeconds(value) {
  if (!Number.isFinite(value)) return 'n/a';
  return value >= 100 ? value.toFixed(0) : value.toFixed(2);
}

function normalizePath(filePath) {
  return filePath.replace(/\\/g, '/');
}

function renderAsciiReport(report, options) {
  const suiteLabel = options.suiteFilter || report.logEntry.suite || 'unknown';

  fmt.header('Slow Tests');
  fmt.settings(`Directory: ${TESTLOGS_DIR}`);
  fmt.settings(`Suite: ${suiteLabel}`);
  fmt.settings(`Threshold: ${formatSeconds(options.threshold)}s`);
  fmt.settings(`Log: ${report.logEntry.fullPath}`);

  const summaryStats = {
    'Slow tests': report.stats.count,
    'Max runtime (s)': formatSeconds(report.stats.maxRuntime),
    'Min runtime (s)': formatSeconds(report.stats.minRuntime),
    'Average runtime (s)': formatSeconds(report.stats.avgRuntime),
  };

  fmt.summary(summaryStats);

  if (!report.sectionFound) {
    fmt.warn('Unable to locate "All Test Results" section; list may be incomplete.');
  }

  if (report.slowTests.length === 0) {
    fmt.success(`No tests exceeding ${formatSeconds(options.threshold)}s threshold.`);
    fmt.footer();
    return;
  }

  fmt.section('Slow Tests');

  const rows = report.slowTests.map((test, index) => ({
    '#': index + 1,
    'Runtime (s)': test.runtime,
    'Tests': test.totalTests,
    'Passed': test.passed,
    'Failed': test.failed,
    'Path': normalizePath(test.testPath),
  }));

  const tableOptions = {
    columns: ['#', 'Runtime (s)', 'Tests', 'Passed', 'Failed', 'Path'],
    format: {
      'Runtime (s)': (value) => {
        const runtime = Number(value) || 0;
        const display = formatSeconds(runtime);
        if (runtime >= options.threshold * 2) {
          return fmt.COLORS.error(display);
        }
        if (runtime >= options.threshold) {
          return fmt.COLORS.warning(display);
        }
        return fmt.COLORS.success(display);
      },
      Failed: (value) => {
        const count = Number(value) || 0;
        return count > 0 ? fmt.COLORS.error(String(count)) : fmt.COLORS.success(String(count));
      },
    },
  };

  fmt.table(rows, tableOptions);
  fmt.footer();
}

function emitCount(report, options) {
  if (options.summaryFormat === 'json') {
    const payload = {
      count: report.stats.count,
      thresholdSeconds: options.threshold,
      suite: options.suiteFilter || report.logEntry.suite || null,
      log: buildLatestLogJson(report.logEntry, { suiteFilter: options.suiteFilter }),
    };
    console.log(JSON.stringify(payload, null, options.quiet ? undefined : 2));
    return;
  }

  console.log(report.stats.count);
}

function buildJsonReport(report, options) {
  return {
    thresholdSeconds: options.threshold,
    suite: options.suiteFilter || report.logEntry.suite || null,
    log: buildLatestLogJson(report.logEntry, { suiteFilter: options.suiteFilter }),
    stats: {
      count: report.stats.count,
      maxRuntime: report.stats.maxRuntime,
      minRuntime: report.stats.minRuntime,
      avgRuntime: report.stats.avgRuntime,
    },
    notes: report.sectionFound ? [] : ['Log missing "All Test Results" section; results may be incomplete.'],
    slowTests: report.slowTests.map((test) => ({
      testPath: normalizePath(test.testPath),
      runtimeSeconds: test.runtime,
      totalTests: test.totalTests,
      passed: test.passed,
      failed: test.failed,
    })),
  };
}

function emitReport(report, options) {
  if (options.mode === 'count') {
    emitCount(report, options);
    return;
  }

  if (options.summaryFormat === 'json') {
    console.log(JSON.stringify(buildJsonReport(report, options), null, options.quiet ? undefined : 2));
    return;
  }

  renderAsciiReport(report, options);
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
    const logEntry = findLatestLogEntry(options.suiteFilter);
    const content = loadLogContent(logEntry.fullPath);
    const { slowTests, sectionFound } = parseSlowTests(content, options.threshold);
    const stats = computeStats(slowTests);

    const report = {
      logEntry,
      slowTests,
      sectionFound,
      stats,
    };

    emitReport(report, options);
    process.exit(0);
  } catch (error) {
    if (error instanceof CliError) {
      fmt.error(error.message);
      process.exit(error.exitCode);
    }
    fmt.error(error.message);
    if (process.env.DEBUG_CLI === '1') {
      console.error(error);
    }
    process.exit(1);
  }
}

main();
