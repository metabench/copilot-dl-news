#!/usr/bin/env node
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

const FAILURE_SUMMARY_PATH = path.join(__dirname, '..', 'test-failure-summary.json');
const TESTLOGS_DIR = path.join(__dirname, '..', 'testlogs');

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

function printSummary(summary, options) {
  const { asJson, compact, failureDetails, brokenInfo } = options;

  if (asJson) {
    console.log(JSON.stringify(summary, null, 2));
    return;
  }

  if (compact) {
    const pieces = [];
    const suiteLabel = summary.suiteDisplay || summary.suite || 'unknown';
    pieces.push(`suite=${suiteLabel}`);
    pieces.push(`at=${(summary.timestamp || 'unknown').replace('T', ' ').replace('Z', 'Z')}`);
    const runtimeValue = typeof summary.totalRuntime === 'number' && !Number.isNaN(summary.totalRuntime)
      ? summary.totalRuntime.toFixed(2)
      : summary.totalRuntime;
    pieces.push(`runtime=${runtimeValue}s`);
    pieces.push(`files=${summary.totalFiles}`);
    pieces.push(`tests=${summary.passedTests}/${summary.totalTests}`);
    pieces.push(`fail=${summary.failedTests}`);
    pieces.push(`slow>${summary.slowTests}`);
    if (summary.usedFallback && summary.fallbackLogPath) {
      const fallbackName = path.basename(summary.fallbackLogPath);
      pieces.push(`fallback-from=${fallbackName}`);
    }
    if (summary.failingFiles.length > 0) {
      const failingLabels = summary.failingFiles
        .slice(0, 3)
        .map(f => {
          const normalized = normalizePath(f);
          return isBrokenTest(normalized, brokenInfo) ? `${normalized} [broken-suite]` : `${normalized}`;
        })
        .join(', ');
      pieces.push(`failures=${failingLabels}${summary.failingFiles.length > 3 ? ', …' : ''}`);
    } else {
      pieces.push('status=pass');
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
    console.log(pieces.join(' | '));
    return;
  }

  // Human-readable format
  const suiteHeadline = summary.suiteDisplay || summary.suite || 'unknown';
  console.log(`\n📊 Test Summary (${suiteHeadline})`);
  console.log(`   Timestamp: ${summary.timestamp || 'unknown'}`);
  console.log(`   Runtime: ${summary.totalRuntime}s`);
  console.log('');
  console.log(`   Files:  ${summary.totalFiles} test files`);
  if (summary.isSuspectAllSuite) {
    console.log(`   Note:  Suite labeled 'ALL' but only ${summary.totalFiles} file(s) detected (threshold ${summary.minimumAllThreshold})`);
  } else if (summary.usedFallback && summary.fallbackLogPath) {
    const skippedName = path.basename(summary.fallbackLogPath);
    const activeName = path.basename(summary.logPath || '');
    console.log(`   Note:  Using earlier ALL run (${activeName}); skipped newer log ${skippedName} (< ${summary.minimumAllThreshold} files)`);
  }
  console.log(`   Tests:  ${summary.totalTests} total (${summary.passedTests} passed, ${summary.failedTests} failed)`);
  console.log(`   Slow:   ${summary.slowTests} files >5s, ${summary.verySlowTests} files >10s`);
  if (typeof summary.activeFailingCount === 'number') {
    console.log(`   Active failing files: ${summary.activeFailingCount}`);
  }

  if (summary.brokenFailingCount && summary.brokenFailingCount > 0) {
    const brokenList = (summary.brokenFailingFiles || [])
      .slice(0, 3)
      .map(f => normalizePath(f))
      .join(', ');
    const suffix = ((summary.brokenFailingFiles || []).length > 3) ? ', …' : '';
    console.log(`   Broken: ${summary.brokenFailingCount} test(s) quarantined [${brokenList}${suffix}]`);
  }

  if (summary.resolvedCount && summary.resolvedCount > 0) {
    console.log(`
   ✅ Fixed since baseline (${summary.resolvedCount})`);
    summary.resolvedSinceBaseline.forEach(entry => {
      const when = entry.resolvedIsoTimestamp ? entry.resolvedIsoTimestamp.replace('T', ' ').replace('Z', 'Z') : 'unknown time';
      console.log(`      • ${normalizePath(entry.testPath)} (resolved in ${entry.resolvedInLog} via suite ${entry.suite}, ${when})`);
    });
  }

  if (summary.failingFiles.length > 0) {
    console.log(`\n   ❌ ${summary.failingFiles.length} failing file(s):`);
    summary.failingFiles.forEach(f => console.log(`      - ${formatFailureLabel(f, failureDetails, brokenInfo)}`));
  } else {
    console.log(`\n   ✅ All tests passing`);
  }
  console.log('');
}

// Parse arguments
const args = process.argv.slice(2);
let suiteFilter = null;
let asJson = false;
let compact = false;

for (const arg of args) {
  if (arg === '--json') {
    asJson = true;
  } else if (arg === '--compact') {
    compact = true;
  } else if (!arg.startsWith('--')) {
    suiteFilter = arg;
  }
}

// Execute
let logPath = getLatestLogPath(suiteFilter);
let summary = extractSummary(logPath);
summary.logPath = logPath;

const fallbackResult = maybeFindBetterAllLog(logPath, summary, suiteFilter);
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

const announceFullRun = !asJson && summary.isLikelyAllSuite;
if (announceFullRun) {
  const logName = path.basename(summary.logPath || '');
  console.log(`Identified full-suite log ${logName} -> test suites: ${summary.totalFiles}, tests run: ${summary.totalTests}, passed: ${summary.passedTests}, failed: ${summary.failedTests}`);
}

printSummary(summary, { asJson, compact, failureDetails, brokenInfo });

// Exit with appropriate code
process.exit(summary.failedTests > 0 ? 1 : 0);
