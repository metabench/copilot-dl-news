#!/usr/bin/env node
'use strict';
/**
 * Test Log History - Find tests that failed and later passed (or remain failing)
 *
 * Scans testlogs/ chronologically to surface transitions:
 *  - Which test files failed in a log and later passed in a newer log.
 *  - Which test files are still failing in the latest runs within the scan window.
 *
 * Usage:
 *   node tests/test-log-history.js
 *   node tests/test-log-history.js --suite unit --since 2025-11-01 --limit-logs 80
 *   node tests/test-log-history.js --json --resolved-only
 *
 * Options:
 *   --suite <name>        Filter logs by suite name (substring, case-insensitive)
 *   --since <iso>         Only consider logs modified after this ISO timestamp/date
 *   --limit-logs <n>      Max number of logs to scan (newest first, then chronological order)
 *   --max-results <n>     Max items to display per section (resolved/active)
 *   --resolved-only       Hide active failing list
 *   --json                Emit JSON output
 *   --compact             Single-line ASCII summary
 *   --quiet               Suppress ASCII when emitting JSON
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
const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');
const RETIRE_THRESHOLD_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks
const DEFAULT_RETIRED_PATTERNS = [/\/deprecated-ui\//];

try {
  if (process.stdout && typeof process.stdout.on === 'function') {
    process.stdout.on('error', (err) => {
      if (err && err.code === 'EPIPE') process.exit(0);
    });
  }
} catch (_) {}

function createParser() {
  const parser = new CliArgumentParser(
    'test-log-history',
    'Scan testlogs to find test files that failed and later passed, plus active failing files.'
  );

  parser
    .add('--suite <name>', 'Suite filter (substring match, case-insensitive)')
    .add('--since <iso>', 'Only consider logs modified after this ISO timestamp/date')
    .add('--limit-logs <n>', 'Maximum logs to scan (newest first, then chronological)', 120)
    .add('--max-results <n>', 'Maximum entries to display per section', 20)
    .add('--resolved-only', 'Only show resolved failures (hide active failing)', false, 'boolean')
    .add('--json', 'Emit JSON output', false, 'boolean')
    .add('--compact', 'Emit single-line ASCII summary', false, 'boolean')
    .add('--quiet', 'Suppress ASCII output when emitting JSON', false, 'boolean');

  return parser;
}

function normalizeOptions(raw) {
  const parsed = { ...raw };

  const limitLogs = parseInt(parsed.limitLogs, 10);
  if (Number.isNaN(limitLogs) || limitLogs <= 0) {
    throw new CliError('limit-logs must be a positive integer');
  }

  const maxResults = parseInt(parsed.maxResults, 10);
  if (Number.isNaN(maxResults) || maxResults <= 0) {
    throw new CliError('max-results must be a positive integer');
  }

  let since = null;
  if (parsed.since) {
    const candidate = new Date(parsed.since);
    if (Number.isNaN(candidate.getTime())) {
      throw new CliError(`Invalid --since value: ${parsed.since}`);
    }
    since = candidate;
  }

  let summaryFormat = parsed.summaryFormat;
  if (parsed.json) summaryFormat = 'json';
  summaryFormat = (summaryFormat || 'ascii').toString().toLowerCase();
  if (!['ascii', 'json'].includes(summaryFormat)) {
    throw new CliError(`Unsupported summary format: ${summaryFormat}`);
  }

  const quiet = Boolean(parsed.quiet);
  if (quiet && summaryFormat !== 'json') {
    throw new CliError('Quiet mode requires --json output');
  }

  return {
    suiteFilter: parsed.suite ? parsed.suite.toString().toLowerCase() : null,
    since,
    limitLogs,
    maxResults,
    resolvedOnly: Boolean(parsed.resolvedOnly),
    summaryFormat,
    compact: Boolean(parsed.compact),
    quiet
  };
}

function ensureLogsDir() {
  if (!fs.existsSync(TESTLOGS_DIR)) {
    throw new CliError(`Test log directory not found: ${TESTLOGS_DIR}`);
  }
}

function toIsoTimestamp(rawTimestamp) {
  const parts = rawTimestamp?.split('T');
  if (!parts || parts.length !== 2) return rawTimestamp;
  const datePart = parts[0];
  const timePart = parts[1]?.replace('Z', '');
  if (!timePart) return rawTimestamp;
  const segments = timePart.split('-');
  if (segments.length !== 4) return rawTimestamp;
  const [hh, mm, ss, ms] = segments;
  return `${datePart}T${hh}:${mm}:${ss}.${ms}Z`;
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function extractSuiteFromFilename(filename) {
  const base = path.basename(filename, '.log');
  const underscoreIndex = base.lastIndexOf('_');
  if (underscoreIndex === -1) return null;
  return base.slice(underscoreIndex + 1) || null;
}

function parseLogEntry(filename, stats) {
  const filepath = path.join(TESTLOGS_DIR, filename);
  const [rawTimestamp] = filename.split('_');
  const suite = extractSuiteFromFilename(filename);
  const isoTimestamp = rawTimestamp ? toIsoTimestamp(rawTimestamp) : stats.mtime.toISOString();

  const content = fs.readFileSync(filepath, 'utf8');
  const tests = new Map();
  let inResults = false;

  for (const line of content.split('\n')) {
    if (!inResults && line.includes('All Test Results (sorted by runtime):')) {
      inResults = true;
      continue;
    }
    if (!inResults) continue;
    if (!/^\d+\./.test(line)) continue;

    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) continue;

    const [, runtimeStr, testPath, totalTests, passedCount, failedCount] = match;
    const normalizedPath = normalizePath(testPath.trim());
    tests.set(normalizedPath, {
      runtime: parseFloat(runtimeStr),
      numTests: parseInt(totalTests, 10),
      numPassing: parseInt(passedCount, 10),
      numFailing: parseInt(failedCount, 10)
    });
  }

  return { filename, filepath, suite, isoTimestamp, modifiedMs: stats.mtimeMs, tests };
}

function collectLogs(options) {
  ensureLogsDir();
  const entries = [];
  const names = fs.readdirSync(TESTLOGS_DIR).filter((name) => name.endsWith('.log'));

  for (const name of names) {
    const fullPath = path.join(TESTLOGS_DIR, name);
    let stats;
    try {
      stats = fs.statSync(fullPath);
    } catch (_) {
      continue;
    }

    const suite = extractSuiteFromFilename(name);
    if (options.suiteFilter && suite && !suite.toLowerCase().includes(options.suiteFilter)) {
      continue;
    }

    if (options.since) {
      if (stats.mtime < options.since) continue;
    }

    entries.push({ name, stats });
  }

  entries.sort((a, b) => b.stats.mtimeMs - a.stats.mtimeMs);
  const limited = entries.slice(0, options.limitLogs);
  return limited
    .map(entry => parseLogEntry(entry.name, entry.stats))
    .filter(entry => entry.tests.size > 0)
    .sort((a, b) => a.modifiedMs - b.modifiedMs); // chronological
}

function buildTransitions(logs) {
  const state = new Map(); // testPath -> { status, lastLog, lastResult, firstFailLog }
  const resolved = [];

  for (const log of logs) {
    for (const [testPath, result] of log.tests.entries()) {
      const status = result.numFailing > 0 ? 'fail' : 'pass';
      const prev = state.get(testPath);

      if (status === 'fail') {
        const firstFailLog = prev && prev.status === 'fail' ? prev.firstFailLog : log;
        state.set(testPath, {
          status,
          lastLog: log,
          lastResult: result,
          firstFailLog
        });
        continue;
      }

      if (prev && prev.status === 'fail') {
        resolved.push({
          testPath,
          failedInLog: prev.lastLog.filename,
          failedAt: prev.lastLog.isoTimestamp,
          failedSuite: prev.lastLog.suite,
          resolvedInLog: log.filename,
          resolvedAt: log.isoTimestamp,
          resolvedSuite: log.suite,
          lastFailingCount: prev.lastResult?.numFailing,
          totalTests: result.numTests,
          runtimeSeconds: result.runtime
        });
      }

      state.set(testPath, {
        status,
        lastLog: log,
        lastResult: result,
        firstFailLog: prev ? prev.firstFailLog : null
      });
    }
  }

  const activeFailing = [];
  for (const [testPath, info] of state.entries()) {
    if (info.status === 'fail') {
      const lastAtMs = info.lastLog?.isoTimestamp ? new Date(info.lastLog.isoTimestamp).getTime() : null;
      activeFailing.push({
        testPath,
        suite: info.lastLog?.suite,
        lastLog: info.lastLog?.filename,
        lastAt: info.lastLog?.isoTimestamp,
        lastAtMs,
        failingCount: info.lastResult?.numFailing,
        totalTests: info.lastResult?.numTests
      });
    }
  }

  resolved.sort((a, b) => {
    const aTime = a.resolvedAt ? new Date(a.resolvedAt).getTime() : 0;
    const bTime = b.resolvedAt ? new Date(b.resolvedAt).getTime() : 0;
    return aTime - bTime;
  });

  activeFailing.sort((a, b) => {
    const aTime = a.lastAt ? new Date(a.lastAt).getTime() : 0;
    const bTime = b.lastAt ? new Date(b.lastAt).getTime() : 0;
    return bTime - aTime;
  });

  return { resolved, activeFailing };
}

function splitRetired(activeFailing, nowMs, thresholdMs, patterns) {
  const retired = [];
  const remaining = [];

  for (const entry of activeFailing) {
    const matchesPattern = patterns.some((regex) => regex.test(entry.testPath));
    const ageMs = entry.lastAtMs ? nowMs - entry.lastAtMs : 0;
    const staleEnough = ageMs >= thresholdMs;

    if (matchesPattern && staleEnough) {
      retired.push(entry);
      continue;
    }
    remaining.push(entry);
  }

  retired.sort((a, b) => (b.lastAtMs || 0) - (a.lastAtMs || 0));
  remaining.sort((a, b) => (b.lastAtMs || 0) - (a.lastAtMs || 0));

  return { retired, remaining };
}

function renderAscii(data, options, context) {
  const { resolved, activeFailing, retiredFailing, logs } = data;
  const suiteLabel = options.suiteFilter ? options.suiteFilter : 'all';

  fmt.header('Test Log History');
  fmt.summary({
    'Logs scanned': logs.length,
    'Suite filter': suiteLabel,
    'Since': options.since ? options.since.toISOString() : 'not set',
    'Resolved': resolved.length,
    'Active failing': activeFailing.length,
    'Retired (ignored)': retiredFailing.length
  });

  if (resolved.length === 0) {
    fmt.info('No fail→pass transitions found in scanned logs.');
  } else {
    const max = options.maxResults;
    fmt.section(`Resolved (${Math.min(resolved.length, max)}/${resolved.length})`);
    const entries = resolved.slice(-max).map(entry => {
      const whenFail = entry.failedAt ? entry.failedAt.replace('T', ' ').replace('Z', 'Z') : 'unknown';
      const whenPass = entry.resolvedAt ? entry.resolvedAt.replace('T', ' ').replace('Z', 'Z') : 'unknown';
      return `${normalizePath(entry.testPath)} — failed in ${entry.failedInLog} (suite ${entry.failedSuite}, ${whenFail}), passed in ${entry.resolvedInLog} (suite ${entry.resolvedSuite}, ${whenPass})`;
    });
    fmt.list('Resolved tests', entries);
  }

  if (!options.resolvedOnly) {
    if (retiredFailing.length > 0) {
      const max = options.maxResults;
      fmt.section(`Retired (ignored) (${Math.min(retiredFailing.length, max)}/${retiredFailing.length})`);
      const entries = retiredFailing.slice(-max).map(entry => {
        const when = entry.lastAt ? entry.lastAt.replace('T', ' ').replace('Z', 'Z') : 'unknown';
        return `${normalizePath(entry.testPath)} — ignored (deprecated >14d, last failure ${when} in ${entry.lastLog})`;
      });
      fmt.list('Retired tests', entries);
    }

    if (activeFailing.length === 0) {
      fmt.success('No active failing files in scanned logs.');
    } else {
      const max = options.maxResults;
      fmt.section(`Active failing (${Math.min(activeFailing.length, max)}/${activeFailing.length})`);
      const entries = activeFailing.slice(-max).map(entry => {
        const when = entry.lastAt ? entry.lastAt.replace('T', ' ').replace('Z', 'Z') : 'unknown';
        return `${normalizePath(entry.testPath)} — failing (${entry.failingCount || 0} failures) in ${entry.lastLog} (suite ${entry.suite}, ${when})`;
      });
      fmt.list('Active failures', entries);
    }
  }

  if (context.warnings.length > 0) {
    fmt.warn(`Warnings: ${context.warnings.join('; ')}`);
  }
}

function renderCompact(data, options) {
  const pieces = [];
  pieces.push(`logs=${data.logs.length}`);
  pieces.push(`resolved=${data.resolved.length}`);
  if (!options.resolvedOnly) {
    pieces.push(`active=${data.activeFailing.length}`);
    pieces.push(`retired=${data.retiredFailing.length}`);
  }
  if (options.suiteFilter) pieces.push(`suite=${options.suiteFilter}`);
  if (options.since) pieces.push(`since=${options.since.toISOString()}`);
  console.log(pieces.join(' | '));
}

function renderJson(data, options) {
  const payload = {
    logsScanned: data.logs.length,
    suiteFilter: options.suiteFilter,
    since: options.since ? options.since.toISOString() : null,
    resolved: data.resolved,
    activeFailing: options.resolvedOnly ? [] : data.activeFailing,
    retiredFailing: options.resolvedOnly ? [] : data.retiredFailing
  };
  const indent = options.quiet ? undefined : 2;
  console.log(JSON.stringify(payload, null, indent));
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
    const logs = collectLogs(options);
    if (logs.length === 0) {
      throw new CliError('No test logs found matching filters.');
    }

    const transitions = buildTransitions(logs);
    const nowMs = Date.now();
    const { retired, remaining } = splitRetired(
      transitions.activeFailing,
      nowMs,
      RETIRE_THRESHOLD_MS,
      DEFAULT_RETIRED_PATTERNS
    );

    const data = { ...transitions, activeFailing: remaining, retiredFailing: retired, logs };
    const warnings = [];
    if (retired.length > 0) {
      warnings.push(`${retired.length} test files marked retired (deprecated >14d)`);
    }

    if (options.summaryFormat === 'json') {
      renderJson(data, options);
      return;
    }

    if (options.compact) {
      renderCompact(data, options);
      return;
    }

    renderAscii(data, options, { warnings });
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
