#!/usr/bin/env node
/**
 * tests-review.js
 *
 * Scans historical Jest timing logs to track the status of failing tests from the
 * most recent full-suite run (suite === "ALL"). The goal is to help engineers
 * understand which failures still require attention without rerunning the entire
 * suite.
 *
 * Behaviour:
 *   1. Load all log files in testlogs/ chronologically.
 *   2. Locate the latest "ALL" suite log (baseline).
 *   3. Capture every test file that failed in that baseline run.
 *   4. Walk through subsequent logs to determine whether each baseline failure
 *      has been re-run and, if so, whether it eventually passed.
 *   5. Present three buckets:
 *        - Fixed after baseline
 *        - Still failing (last observed result was a failure)
 *        - Awaiting retest (no data after baseline)
 *
 * Usage:
 *   node tests/tests-review.js
 *   node tests/tests-review.js --json   (machine-readable output)
 */

const fs = require('fs');
const path = require('path');

const LOG_DIR = path.join(__dirname, '..', 'testlogs');
const OUTPUT_MODES = {
  HUMAN: 'human',
  JSON: 'json'
};

function parseArgs() {
  const args = process.argv.slice(2);
  if (args.includes('--json')) return OUTPUT_MODES.JSON;
  return OUTPUT_MODES.HUMAN;
}

function ensureUtf8ForWindows() {
  if (process.platform === 'win32' && process.stdout.isTTY) {
    try {
      process.stdout.setDefaultEncoding('utf8');
      process.stdout.write('\u001b[?1h\u001b=');
    } catch (_) {
      // Ignore encoding issues on older shells.
    }
  }
}

function loadLogFilenames() {
  if (!fs.existsSync(LOG_DIR)) {
    throw new Error('testlogs directory not found. Run some tests first to generate logs.');
  }
  return fs.readdirSync(LOG_DIR)
    .filter(f => f.endsWith('.log'))
    .sort(); // filenames are timestamped so lexical order === chronological order
}

function toIsoTimestamp(rawTimestamp) {
  // Example raw: 2025-10-17T22-00-14-853Z
  const [datePart, timePartWithZone] = rawTimestamp.split('T');
  if (!timePartWithZone) return rawTimestamp; // fallback
  const parts = timePartWithZone.replace('Z', '').split('-');
  if (parts.length !== 4) return rawTimestamp; // unexpected format
  const [hh, mm, ss, ms] = parts;
  return `${datePart}T${hh}:${mm}:${ss}.${ms}Z`;
}

function parseLogFile(filename) {
  const filepath = path.join(LOG_DIR, filename);
  const content = fs.readFileSync(filepath, 'utf8');
  const [rawTimestamp, suiteWithExt] = filename.split('_');
  if (!rawTimestamp || !suiteWithExt) {
    return null;
  }
  const suite = suiteWithExt.replace(/\.log$/, '');
  const tests = [];
  let recording = false;

  for (const line of content.split('\n')) {
    if (line.includes('All Test Results (sorted by runtime):')) {
      recording = true;
      continue;
    }
    if (!recording) continue;
    if (!/^\d+\./.test(line)) continue;
    const match = line.match(/^\d+\.\s+([\d.]+)s\s+-\s+(.+?)\s+\((\d+)\s+tests?,\s+(\d+)\s+passed,\s+(\d+)\s+failed\)/);
    if (!match) continue;
    const [, runtimeStr, testPath, testsTotal, passed, failed] = match;
    tests.push({
      path: testPath.replace(/\\/g, '/'),
      runtime: parseFloat(runtimeStr),
      numTests: parseInt(testsTotal, 10),
      numPassing: parseInt(passed, 10),
      numFailing: parseInt(failed, 10)
    });
  }

  const isoTimestamp = toIsoTimestamp(rawTimestamp);
  const date = new Date(isoTimestamp);
  return {
    filename,
    filepath,
    timestamp: rawTimestamp,
    isoTimestamp,
    suite,
    tests,
    date
  };
}

function loadLogs() {
  const filenames = loadLogFilenames();
  const logs = [];
  for (const file of filenames) {
    const parsed = parseLogFile(file);
    if (parsed) logs.push(parsed);
  }
  return logs;
}

function findBaselineLog(logs) {
  const candidates = logs.filter(l => l.suite === 'ALL');
  if (candidates.length === 0) return null;
  return candidates[candidates.length - 1];
}

function buildBaselineFailures(baseline) {
  const failingTests = baseline.tests.filter(t => t.numFailing > 0);
  const map = new Map();
  for (const test of failingTests) {
    map.set(test.path, {
      testPath: test.path,
      baseline: {
        timestamp: baseline.timestamp,
        isoTimestamp: baseline.isoTimestamp,
        suite: baseline.suite,
        runtime: test.runtime,
        numFailing: test.numFailing,
        numTests: test.numTests
      },
      status: 'fail',
      history: [
        {
          timestamp: baseline.timestamp,
          isoTimestamp: baseline.isoTimestamp,
          suite: baseline.suite,
          result: 'fail',
          runtime: test.runtime,
          numFailing: test.numFailing,
          numTests: test.numTests
        }
      ],
      lastSeen: {
        timestamp: baseline.timestamp,
        isoTimestamp: baseline.isoTimestamp,
        suite: baseline.suite
      }
    });
  }
  return map;
}

function reviewFailures(logs, baseline, tracked) {
  const baselineIndex = logs.findIndex(log => log.filename === baseline.filename);
  if (baselineIndex === -1) return tracked;

  for (let i = baselineIndex + 1; i < logs.length; i++) {
    const log = logs[i];
    const testLookup = new Map();
    for (const test of log.tests) {
      testLookup.set(test.path, test);
    }

    for (const [testPath, entry] of tracked.entries()) {
      if (!testLookup.has(testPath)) {
        continue;
      }
      const testResult = testLookup.get(testPath);
      const result = testResult.numFailing > 0 ? 'fail' : 'pass';

      entry.history.push({
        timestamp: log.timestamp,
        isoTimestamp: log.isoTimestamp,
        suite: log.suite,
        result,
        runtime: testResult.runtime,
        numFailing: testResult.numFailing,
        numTests: testResult.numTests
      });

      entry.lastSeen = {
        timestamp: log.timestamp,
        isoTimestamp: log.isoTimestamp,
        suite: log.suite
      };

      if (result === 'pass' && entry.status !== 'pass') {
        entry.status = 'pass';
        entry.fixed = {
          timestamp: log.timestamp,
          isoTimestamp: log.isoTimestamp,
          suite: log.suite,
          runtime: testResult.runtime
        };
      } else if (result === 'fail') {
        entry.status = 'fail';
        entry.lastFail = {
          timestamp: log.timestamp,
          isoTimestamp: log.isoTimestamp,
          suite: log.suite,
          runtime: testResult.runtime,
          numFailing: testResult.numFailing
        };
      }
    }
  }

  return tracked;
}

function formatDateForDisplay(isoTimestamp) {
  const date = new Date(isoTimestamp);
  if (!Number.isFinite(date.getTime())) return isoTimestamp;
  return date.toISOString().replace('T', ' ').replace('Z', 'Z');
}

function printHumanReport(baseline, tracked) {
  const entries = Array.from(tracked.values());
  const fixed = entries.filter(e => e.status === 'pass');
  const stillFailing = entries.filter(e => e.status === 'fail' && (e.history.length > 1));
  const awaitingRetest = entries.filter(e => e.history.length === 1);

  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('🧪 TESTS REVIEW');
  console.log('════════════════════════════════════════════════════════════════════════════════');
  console.log('');
  console.log(`Baseline log : ${baseline.filename}`);
  console.log(`Captured     : ${entries.length} failing test file(s)`);
  console.log('');

  if (fixed.length > 0) {
    console.log(`✅ Fixed since baseline (${fixed.length})`);
    console.log('────────────────────────────────────────────────────────────────────────────────');
    for (const entry of fixed) {
      const fix = entry.fixed;
      console.log(`  • ${entry.testPath}`);
      console.log(`    Baseline : ${formatDateForDisplay(entry.baseline.isoTimestamp)} (fail ${entry.baseline.numFailing}/${entry.baseline.numTests})`);
      console.log(`    Fixed on : ${formatDateForDisplay(fix.isoTimestamp)} via suite ${fix.suite} (runtime ${fix.runtime.toFixed(2)}s)`);
      console.log('');
    }
  } else {
    console.log('✅ Fixed since baseline (0)');
    console.log('────────────────────────────────────────────────────────────────────────────────');
    console.log('  None yet.');
    console.log('');
  }

  if (stillFailing.length > 0) {
    console.log(`❌ Still failing (${stillFailing.length})`);
    console.log('────────────────────────────────────────────────────────────────────────────────');
    for (const entry of stillFailing) {
      const last = entry.lastFail || entry.history[entry.history.length - 1];
      console.log(`  • ${entry.testPath}`);
      console.log(`    Baseline : ${formatDateForDisplay(entry.baseline.isoTimestamp)} (fail ${entry.baseline.numFailing}/${entry.baseline.numTests})`);
      console.log(`    Last fail: ${formatDateForDisplay(last.isoTimestamp)} via suite ${last.suite}`);
      console.log('');
    }
  }

  if (awaitingRetest.length > 0) {
    console.log(`🕒 Awaiting retest (${awaitingRetest.length})`);
    console.log('────────────────────────────────────────────────────────────────────────────────');
    for (const entry of awaitingRetest) {
      console.log(`  • ${entry.testPath}`);
      console.log(`    Last seen: ${formatDateForDisplay(entry.baseline.isoTimestamp)} (baseline failure)`);
      console.log('');
    }
  }

  console.log('════════════════════════════════════════════════════════════════════════════════');
}

function buildJsonReport(baseline, tracked) {
  const entries = Array.from(tracked.values());
  return {
    baseline: {
      filename: baseline.filename,
      timestamp: baseline.timestamp,
      isoTimestamp: baseline.isoTimestamp
    },
    totals: {
      tracked: entries.length,
      fixed: entries.filter(e => e.status === 'pass').length,
      stillFailing: entries.filter(e => e.status === 'fail' && e.history.length > 1).length,
      awaitingRetest: entries.filter(e => e.history.length === 1).length
    },
    entries: entries.map(entry => ({
      testPath: entry.testPath,
      status: entry.status,
      baseline: entry.baseline,
      fixed: entry.fixed || null,
      lastFail: entry.lastFail || null,
      history: entry.history
    }))
  };
}

function main() {
  ensureUtf8ForWindows();
  const mode = parseArgs();

  let logs;
  try {
    logs = loadLogs();
  } catch (error) {
    console.error(`❌ ${error.message}`);
    process.exitCode = 1;
    return;
  }

  if (logs.length === 0) {
    console.error('❌ No logs available in testlogs/.');
    process.exitCode = 1;
    return;
  }

  const baseline = findBaselineLog(logs);
  if (!baseline) {
    console.error('❌ Unable to locate a baseline log (suite "ALL"). Run the full suite once to create it.');
    process.exitCode = 1;
    return;
  }

  const tracked = buildBaselineFailures(baseline);
  if (tracked.size === 0) {
    if (mode === OUTPUT_MODES.JSON) {
      console.log(JSON.stringify({
        baseline: {
          filename: baseline.filename,
          timestamp: baseline.timestamp,
          isoTimestamp: baseline.isoTimestamp
        },
        totals: {
          tracked: 0,
          fixed: 0,
          stillFailing: 0,
          awaitingRetest: 0
        },
        entries: []
      }, null, 2));
    } else {
      console.log('🎉 Baseline run did not record any failing tests. Nothing to review.');
    }
    return;
  }

  reviewFailures(logs, baseline, tracked);

  if (mode === OUTPUT_MODES.JSON) {
    const report = buildJsonReport(baseline, tracked);
    console.log(JSON.stringify(report, null, 2));
  } else {
    printHumanReport(baseline, tracked);
  }
}

main();
