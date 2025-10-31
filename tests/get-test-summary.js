#!/usr/bin/env node
'use strict';
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

const FAILURE_SUMMARY_PATH = path.join(__dirname, '..', 'test-failure-summary.json');
const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

function createParser() {
  const parser = new CliArgumentParser(
    'get-test-summary',
    'Extract key metrics from the latest test log without rerunning tests.'
  );

  parser
    .add('--suite <name>', 'Suite filter (unit, e2e, all)')
    .add('--json', 'Emit JSON summary (alias for --summary-format json)', false, 'boolean')
    .add('--compact', 'Emit single-line summary', false, 'boolean')
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

  const suiteFilter = rawOptions.suite || filteredPositional[0] || null;

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
    throw new CliError('Quiet mode requires JSON summary output. Use --summary-format json or --json.');
  }

  return {
    suiteFilter,
    summaryFormat,
    quiet,
    compact: Boolean(rawOptions.compact)
  };
}

function getLatestLogPath(suiteFilter) {
  const scriptPath = path.join(__dirname, 'get-latest-log.js');
  const command = suiteFilter
    ? `node "${scriptPath}" "${suiteFilter}"`
    : `node "${scriptPath}"`;

  try {
    return execSync(command, { encoding: 'utf8' }).trim();
  } catch (_) {
    throw new CliError('Could not find latest log file.');
  }
}

function extractSummary(logPath) {
  const content = fs.readFileSync(logPath, 'utf8');
  const lines = content.split('\n');
  
  const summary = {
    timestamp: null,
    suite: null,
    suiteDisplay: null,
    isLabelAll: false,
    meetsAllThreshold: false,
    isLikelyAllSuite: false,
    isSuspectAllSuite: false,
    minimumAllThreshold: 50,
    logPath: null,
    usedFallback: false,
    fallbackLogPath: null,
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
  
  const normalizedSuite = summary.suite ? summary.suite.trim().toLowerCase() : null;
  summary.isLabelAll = normalizedSuite === 'all';
  summary.meetsAllThreshold = summary.totalFiles >= summary.minimumAllThreshold;
  summary.isLikelyAllSuite = summary.isLabelAll && summary.meetsAllThreshold;
  summary.isSuspectAllSuite = summary.isLabelAll && !summary.meetsAllThreshold;

  if (summary.isLikelyAllSuite) {
    summary.suiteDisplay = summary.suite;
  } else if (summary.isSuspectAllSuite) {
    const fileLabel = summary.totalFiles === 1 ? '1 file' : `${summary.totalFiles} files`;
    summary.suiteDisplay = `${summary.suite} (suspect — ${fileLabel})`;
  } else {
    summary.suiteDisplay = summary.suite;
  }

  return summary;
}

function maybeFindBetterAllLog(currentPath, summary, suiteFilter) {
  const normalizedFilter = suiteFilter ? suiteFilter.toLowerCase() : null;
  const shouldVerifyAll = normalizedFilter === 'all' || (!normalizedFilter && summary.isLabelAll);

  if (!shouldVerifyAll) {
    return { path: currentPath, summary, changed: false };
  }

  if (summary.isLikelyAllSuite) {
    return { path: currentPath, summary, changed: false };
  }

  if (!fs.existsSync(TESTLOGS_DIR)) {
    return { path: currentPath, summary, changed: false };
  }

  const allLogFiles = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .filter(f => f.toLowerCase().includes('_all.log'))
    .sort()
    .reverse();

  const currentBase = path.basename(currentPath);
  const currentIndex = allLogFiles.indexOf(currentBase);
  const candidateFiles = currentIndex >= 0
    ? allLogFiles.slice(currentIndex + 1)
    : allLogFiles;

  for (const file of candidateFiles) {
    const candidatePath = path.join(TESTLOGS_DIR, file);
    const candidateSummary = extractSummary(candidatePath);
    candidateSummary.logPath = candidatePath;

    if (!candidateSummary.isLabelAll) {
      continue;
    }

    if (candidateSummary.isLikelyAllSuite) {
      candidateSummary.usedFallback = true;
      candidateSummary.fallbackLogPath = currentPath;
      return { path: candidatePath, summary: candidateSummary, changed: true };
    }
  }

  return { path: currentPath, summary, changed: false };
}

function toIsoTimestamp(rawTimestamp) {
  const parts = rawTimestamp?.split('T');
  if (!parts || parts.length !== 2) {
    return rawTimestamp;
  }
  const datePart = parts[0];
  const timePart = parts[1]?.replace('Z', '');
  if (!timePart) {
    return rawTimestamp;
  }
  const segments = timePart.split('-');
  if (segments.length !== 4) {
    return rawTimestamp;
  }
  const [hh, mm, ss, ms] = segments;
  return `${datePart}T${hh}:${mm}:${ss}.${ms}Z`;
}

function parseLogTestResults(filename) {
  const filepath = path.join(TESTLOGS_DIR, filename);
  if (!fs.existsSync(filepath)) {
    return null;
  }

  const [rawTimestamp, suiteWithExt] = filename.split('_');
  if (!rawTimestamp || !suiteWithExt) {
    return null;
  }
  const suite = suiteWithExt.replace(/\.log$/i, '');
  const isoTimestamp = toIsoTimestamp(rawTimestamp);

  const content = fs.readFileSync(filepath, 'utf8');
  const tests = new Map();
  let recording = false;

  for (const line of content.split('\n')) {
    if (!recording && line.includes('All Test Results (sorted by runtime):')) {
      recording = true;
      continue;
    }
    if (!recording) {
      continue;
    }
    if (!/^\d+\./.test(line)) {
      continue;
    }
    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) {
      continue;
    }
    const [, runtimeStr, testPath, totalTests, passedCount, failedCount] = match;
    const normalizedPath = normalizePath(testPath);
    tests.set(normalizedPath, {
      runtime: parseFloat(runtimeStr),
      numTests: parseInt(totalTests, 10),
      numPassing: parseInt(passedCount, 10),
      numFailing: parseInt(failedCount, 10)
    });
  }

  return {
    filename,
    filepath,
    suite,
    isoTimestamp,
    tests
  };
}

function resolveFailuresFromLaterLogs(baselinePath, failingFiles) {
  if (!baselinePath || failingFiles.length === 0) {
    return { remaining: failingFiles, resolved: [] };
  }

  const baselineName = path.basename(baselinePath);
  const logFiles = fs.readdirSync(TESTLOGS_DIR)
    .filter(f => f.endsWith('.log'))
    .sort();

  const baselineIndex = logFiles.indexOf(baselineName);
  if (baselineIndex === -1) {
    return { remaining: failingFiles, resolved: [] };
  }

  const normalizedToOriginal = new Map();
  failingFiles.forEach(original => {
    normalizedToOriginal.set(normalizePath(original), original);
  });

  const unresolved = new Set(normalizedToOriginal.keys());
  const resolvedDetails = [];

  for (let i = baselineIndex + 1; i < logFiles.length && unresolved.size > 0; i++) {
    const parsed = parseLogTestResults(logFiles[i]);
    if (!parsed) {
      continue;
    }
    for (const testPath of Array.from(unresolved)) {
      const result = parsed.tests.get(testPath);
      if (!result) {
        continue;
      }
      if (result.numFailing === 0) {
        unresolved.delete(testPath);
        resolvedDetails.push({
          testPath: normalizedToOriginal.get(testPath) || testPath,
          resolvedInLog: parsed.filename,
          resolvedIsoTimestamp: parsed.isoTimestamp,
          suite: parsed.suite
        });
      }
    }
  }

  const remaining = Array.from(unresolved).map(p => normalizedToOriginal.get(p) || p);
  return { remaining, resolved: resolvedDetails };
}

function loadFailureDetails() {
  if (!fs.existsSync(FAILURE_SUMMARY_PATH)) {
    return new Map();
  }

  try {
    const payload = JSON.parse(fs.readFileSync(FAILURE_SUMMARY_PATH, 'utf8'));
    const map = new Map();
    for (const entry of payload.failures || []) {
      if (!entry || !entry.filePath) continue;
      map.set(normalizePath(entry.filePath), entry);
    }
    return map;
  } catch (error) {
    console.warn('⚠️  Could not read test-failure-summary.json:', error.message);
    return new Map();
  }
}

function normalizePath(value) {
  return value.replace(/\\/g, '/');
}

function collectBrokenTests() {
  const brokenDir = path.join(__dirname, 'broken');
  const result = {
    relPaths: new Set(),
    baseNames: new Set()
  };

  if (!fs.existsSync(brokenDir)) {
    return result;
  }

  const walk = dir => {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (!entry.name.endsWith('.test.js')) {
        continue;
      }
      const relPath = normalizePath(path.relative(process.cwd(), fullPath));
      result.relPaths.add(relPath);
      result.baseNames.add(entry.name);
    }
  };

  walk(brokenDir);
  return result;
}

function isBrokenTest(testPath, brokenInfo) {
  if (!brokenInfo) {
    return false;
  }
  const normalized = normalizePath(testPath);
  if (normalized.includes('tests/broken/')) {
    return true;
  }
  const baseName = path.basename(normalized);
  if (brokenInfo.baseNames.has(baseName)) {
    return true;
  }
  const stripped = normalized.replace(/^\.\//, '');
  if (brokenInfo.relPaths.has(stripped)) {
    return true;
  }
  return false;
}

function formatFailureLabel(testPath, failureDetails, brokenInfo) {
  const normalizedPath = normalizePath(testPath);
  const isBroken = isBrokenTest(normalizedPath, brokenInfo);
  const detail = failureDetails.get(normalizedPath);
  const baseLabel = isBroken ? `${normalizedPath} [broken-suite]` : normalizedPath;
  if (!detail || !Array.isArray(detail.entries) || detail.entries.length === 0) {
    return baseLabel;
  }
  const message = detail.entries[0].message || '(No message captured)';
  return `${baseLabel} — ${message}`;
}

function formatRuntime(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return value;
  }
  return value.toFixed(2);
}

function renderAsciiSummary(summary, context) {
  const suiteHeadline = summary.suiteDisplay || summary.suite || 'unknown';

  fmt.header(`Test Summary (${suiteHeadline})`);
  if (summary.logPath) {
    fmt.settings(`Log: ${summary.logPath}`);
  }

  if (summary.isLikelyAllSuite) {
    const logName = path.basename(summary.logPath || '');
    fmt.info(`Identified full-suite log ${logName} -> suites: ${summary.totalFiles}, tests run: ${summary.totalTests}, passed: ${summary.passedTests}, failed: ${summary.failedTests}`);
  }

  if (summary.usedFallback && summary.fallbackLogPath) {
    const fallbackName = path.basename(summary.fallbackLogPath);
    fmt.info(`Using earlier ALL log (fallback from ${fallbackName}) due to low file count.`);
  }

  if (summary.isSuspectAllSuite) {
    fmt.warn(`Suite labeled 'ALL' but only ${summary.totalFiles} file(s) detected (threshold ${summary.minimumAllThreshold}).`);
  }

  const stats = {
    'Timestamp': summary.timestamp || 'unknown',
    'Runtime (s)': formatRuntime(summary.totalRuntime),
    'Test files': summary.totalFiles,
    'Tests (passed/total)': `${summary.passedTests}/${summary.totalTests}`,
    'Failed tests': summary.failedTests,
    'Slow files (>5s)': summary.slowTests,
    'Very slow files (>10s)': summary.verySlowTests
  };

  if (typeof summary.activeFailingCount === 'number') {
    stats['Active failing files'] = summary.activeFailingCount;
  }

  if (typeof summary.resolvedCount === 'number') {
    stats['Resolved since baseline'] = summary.resolvedCount;
  }

  if (summary.brokenFailingCount && summary.brokenFailingCount > 0) {
    stats['Broken test failures'] = summary.brokenFailingCount;
  }

  fmt.summary(stats);

  if (summary.resolvedCount && summary.resolvedCount > 0 && Array.isArray(summary.resolvedSinceBaseline)) {
    const resolvedEntries = summary.resolvedSinceBaseline.map(entry => {
      const when = entry.resolvedIsoTimestamp ? entry.resolvedIsoTimestamp.replace('T', ' ').replace('Z', 'Z') : 'unknown time';
      return `${normalizePath(entry.testPath)} (resolved in ${entry.resolvedInLog}, suite ${entry.suite}, ${when})`;
    });
    fmt.section('Resolved Since Baseline');
    fmt.list('Resolved tests', resolvedEntries);
  }

  if (summary.brokenFailingCount && summary.brokenFailingCount > 0) {
    fmt.section('Broken Suite Failures');
    const samples = (summary.brokenFailingFiles || []).map(normalizePath);
    fmt.list('Broken tests', samples);
  }

  if (summary.failingFiles.length > 0) {
    fmt.section('Failing Files');
    const failingLabels = summary.failingFiles.map(f => formatFailureLabel(f, context.failureDetails, context.brokenInfo));
    fmt.list('Failures', failingLabels);
  } else {
    fmt.success('All tests passing.');
  }

  fmt.footer();
}

function renderCompactSummary(summary, context) {
  const pieces = [];
  const suiteLabel = summary.suiteDisplay || summary.suite || 'unknown';
  pieces.push(`suite=${suiteLabel}`);
  pieces.push(`at=${(summary.timestamp || 'unknown').replace('T', ' ').replace('Z', 'Z')}`);
  pieces.push(`runtime=${formatRuntime(summary.totalRuntime)}s`);
  pieces.push(`files=${summary.totalFiles}`);
  pieces.push(`tests=${summary.passedTests}/${summary.totalTests}`);
  pieces.push(`fail=${summary.failedTests}`);
  pieces.push(`slow>${summary.slowTests}`);
  if (summary.usedFallback && summary.fallbackLogPath) {
    const fallbackName = path.basename(summary.fallbackLogPath);
    pieces.push(`fallback-from=${fallbackName}`);
  }
  if (typeof summary.activeFailingCount === 'number') {
    pieces.push(`activeFailing=${summary.activeFailingCount}`);
  }
  if (summary.resolvedCount && summary.resolvedCount > 0) {
    pieces.push(`resolved=${summary.resolvedCount}`);
  }
  if (summary.brokenFailingCount && summary.brokenFailingCount > 0) {
    pieces.push(`broken=${summary.brokenFailingCount}`);
  }
  if (summary.failingFiles.length > 0) {
    const failingLabels = summary.failingFiles
      .slice(0, 3)
      .map(f => {
        const normalized = normalizePath(f);
        return isBrokenTest(normalized, context.brokenInfo) ? `${normalized} [broken-suite]` : normalized;
      })
      .join(', ');
    pieces.push(`failures=${failingLabels}${summary.failingFiles.length > 3 ? ', …' : ''}`);
  } else {
    pieces.push('status=pass');
  }
  if (summary.isLikelyAllSuite) {
    const logName = path.basename(summary.logPath || '');
    pieces.push(`log=${logName}`);
  }
  console.log(pieces.join(' | '));
}

function buildJsonSummary(summary) {
  return summary;
}

function emitSummary(summary, context, options) {
  if (options.summaryFormat === 'json') {
    const indent = options.quiet ? undefined : 2;
    console.log(JSON.stringify(buildJsonSummary(summary), null, indent));
    return;
  }

  if (options.compact) {
    if (summary.isLikelyAllSuite) {
      const logName = path.basename(summary.logPath || '');
      fmt.info(`Identified full-suite log ${logName} -> suites: ${summary.totalFiles}, tests run: ${summary.totalTests}, passed: ${summary.passedTests}, failed: ${summary.failedTests}`);
    }
    renderCompactSummary(summary, context);
    return;
  }

  renderAsciiSummary(summary, context);
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
    let logPath = getLatestLogPath(options.suiteFilter);
    let summary = extractSummary(logPath);
    summary.logPath = logPath;

    const fallbackResult = maybeFindBetterAllLog(logPath, summary, options.suiteFilter);
    if (fallbackResult.changed) {
      logPath = fallbackResult.path;
      summary = fallbackResult.summary;
      summary.usedFallback = true;
    }

    summary.logPath = logPath;

    const resolutionResult = resolveFailuresFromLaterLogs(logPath, summary.failingFiles);
    summary.resolvedSinceBaseline = resolutionResult.resolved;
    summary.resolvedCount = resolutionResult.resolved.length;
    summary.failingFiles = resolutionResult.remaining;
    summary.activeFailingCount = summary.failingFiles.length;

    const failureDetails = loadFailureDetails();
    const brokenInfo = collectBrokenTests();
    const brokenFailingFiles = summary.failingFiles.filter(f => isBrokenTest(f, brokenInfo));
    summary.brokenFailingFiles = brokenFailingFiles;
    summary.brokenFailingCount = brokenFailingFiles.length;

    emitSummary(summary, { failureDetails, brokenInfo }, options);

    process.exit(summary.failedTests > 0 ? 1 : 0);
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
