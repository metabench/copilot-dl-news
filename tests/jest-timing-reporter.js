/**
 * Custom Jest reporter to capture and display test execution times
 * Generates both console output and JSON file with timing data
 */

const fs = require('fs');
const path = require('path');

class TimingReporter {
  constructor(globalConfig, options) {
    this._globalConfig = globalConfig;
    this._options = options || {};
    this._testResults = [];
    this._startTime = Date.now();
    const envMode = (process.env.JEST_TIMING_REPORTER_MODE || '').trim().toLowerCase();
    const optionMode = typeof this._options.mode === 'string' ? this._options.mode.trim().toLowerCase() : '';
    const candidateMode = optionMode || envMode;
    this._quietMode = ['quiet', 'minimal', 'summary'].includes(candidateMode);
  }



  onRunStart() {
    this._startTime = Date.now();
    if (!this._quietMode) {
      console.log('\n⏱️  Jest Timing Reporter - Tracking test execution times...\n');
    }
  }


  onTestResult(test, testResult, aggregatedResult) {
    const runtime = testResult.perfStats.runtime / 1000; // Convert to seconds
    const testPath = path.relative(process.cwd(), testResult.testFilePath);

    const result = {
      filePath: testPath,
      runtime: runtime,
      numTests: testResult.numPassingTests + testResult.numFailingTests,
      numPassing: testResult.numPassingTests,
      numFailing: testResult.numFailingTests,
      numPending: testResult.numPendingTests,
      perfStats: testResult.perfStats,
      failures: testResult.testResults
        .filter(caseResult => caseResult.status === 'failed')
        .map(caseResult => ({
          title: caseResult.fullName,
          message: this._condenseFailureMessage(caseResult.failureMessages?.[0] || '')
        }))
    };

    this._testResults.push(result);

    // Display slow tests immediately (> 2 seconds)
    if (!this._quietMode && runtime > 2) {
      const emoji = runtime > 10 ? '🐌' : '⏳';
      console.log(`${emoji} ${runtime.toFixed(2)}s - ${testPath}`);
    }
  }


  onRunComplete(contexts, aggregatedResult) {
    const totalTime = (Date.now() - this._startTime) / 1000;
    const runIsoTimestamp = new Date().toISOString();
    const fileTimestamp = runIsoTimestamp.replace(/[:.]/g, '-');
    const suiteName = this._resolveSuiteName(aggregatedResult);
    const verbose = !this._quietMode;

    this._testResults.sort((a, b) => b.runtime - a.runtime);

    const output = [];

    output.push('\n📊 Top 20 Slowest Tests:\n');
    output.push('─'.repeat(80));

    this._testResults.slice(0, 20).forEach((result, index) => {
      const emoji = this._getEmojiForTime(result.runtime);
      const passFail = result.numFailing > 0 ? '❌' : '✅';
      const line = `${index + 1}. ${emoji} ${result.runtime.toFixed(2)}s ${passFail} ${result.filePath}`;
      output.push(line);
      if (verbose) {
        console.log(line);
      }
    });

    output.push('─'.repeat(80));
    if (verbose) {
      console.log('─'.repeat(80));
    }

    const totalTestTime = this._testResults.reduce((sum, r) => sum + r.runtime, 0);
    const suiteCount = this._testResults.length || 1;
    const avgTestTime = totalTestTime / suiteCount;
    const slowTests = this._testResults.filter(r => r.runtime > 5).length;
    const verySlowTests = this._testResults.filter(r => r.runtime > 10).length;
    const slowPercent = ((slowTests / suiteCount) * 100).toFixed(1);
    const verySlowPercent = ((verySlowTests / suiteCount) * 100).toFixed(1);

    output.push('\n📈 Test Performance Summary:\n');
    output.push(`Total Runtime:        ${totalTime.toFixed(2)}s`);
    output.push(`Total Test Files:     ${this._testResults.length}`);
    output.push(`Average Test Time:    ${avgTestTime.toFixed(2)}s`);
    output.push(`Slow Tests (>5s):     ${slowTests} (${slowPercent}%)`);
    output.push(`Very Slow Tests (>10s): ${verySlowTests} (${verySlowPercent}%)`);

    if (verbose) {
      console.log('\n📈 Test Performance Summary:\n');
      console.log(`Total Runtime:        ${totalTime.toFixed(2)}s`);
      console.log(`Total Test Files:     ${this._testResults.length}`);
      console.log(`Average Test Time:    ${avgTestTime.toFixed(2)}s`);
      console.log(`Slow Tests (>5s):     ${slowTests} (${slowPercent}%)`);
      console.log(`Very Slow Tests (>10s): ${verySlowTests} (${verySlowPercent}%)`);
    }

    const puppeteerTime = this._testResults
      .filter(r => r.filePath.includes('puppeteer') || r.filePath.includes('e2e'))
      .reduce((sum, r) => sum + r.runtime, 0);

    const httpTime = this._testResults
      .filter(r => r.filePath.includes('http.test'))
      .reduce((sum, r) => sum + r.runtime, 0);

    const onlineTime = this._testResults
      .filter(r => r.filePath.includes('online'))
      .reduce((sum, r) => sum + r.runtime, 0);

    const runtimeDivisor = totalTestTime || 1;

    output.push('\n⏱️  Time by Category:\n');
    output.push(`E2E/Puppeteer Tests:  ${puppeteerTime.toFixed(2)}s (${((puppeteerTime / runtimeDivisor) * 100).toFixed(1)}%)`);
    output.push(`HTTP Server Tests:    ${httpTime.toFixed(2)}s (${((httpTime / runtimeDivisor) * 100).toFixed(1)}%)`);
    output.push(`Online API Tests:     ${onlineTime.toFixed(2)}s (${((onlineTime / runtimeDivisor) * 100).toFixed(1)}%)`);

    if (verbose) {
      console.log('\n⏱️  Time by Category:\n');
      console.log(`E2E/Puppeteer Tests:  ${puppeteerTime.toFixed(2)}s (${((puppeteerTime / runtimeDivisor) * 100).toFixed(1)}%)`);
      console.log(`HTTP Server Tests:    ${httpTime.toFixed(2)}s (${((httpTime / runtimeDivisor) * 100).toFixed(1)}%)`);
      console.log(`Online API Tests:     ${onlineTime.toFixed(2)}s (${((onlineTime / runtimeDivisor) * 100).toFixed(1)}%)`);
    }

    const failureSummary = this._collectFailureSummary();
    const failureSummaryPayload = {
      timestamp: runIsoTimestamp,
      suite: suiteName,
      failures: failureSummary
    };

    const failureSummaryPath = path.join(process.cwd(), 'test-failure-summary.json');
    fs.writeFileSync(failureSummaryPath, JSON.stringify(failureSummaryPayload, null, 2), 'utf8');
    if (failureSummary.length > 0 && verbose) {
      console.log(`❌ Failure details saved to: ${failureSummaryPath}`);
    }
    if (verbose) {
      console.log('ℹ️  Quick status: node tests/get-test-summary.js --compact');
    }

    const testlogsDir = path.join(process.cwd(), 'testlogs');

    if (!fs.existsSync(testlogsDir)) {
      fs.mkdirSync(testlogsDir, { recursive: true });
    }

    const logBaseName = `${fileTimestamp}_${suiteName}`;
    const logPath = path.join(testlogsDir, `${logBaseName}.log`);
    const logContent = [
      `Test Timing Report - ${runIsoTimestamp}`,
      `Suite: ${suiteName}`,
      '='.repeat(80),
      '',
      ...output,
      '',
      '='.repeat(80),
      'All Test Results (sorted by runtime):',
      '='.repeat(80),
      '',
      ...this._testResults.map((r, i) =>
        `${i + 1}. ${r.runtime.toFixed(2)}s - ${r.filePath} (${r.numTests} tests, ${r.numPassing} passed, ${r.numFailing} failed)`
      ),
      '',
      'Tip: node tests/get-test-summary.js --compact',
      ...(failureSummary.length > 0 ? [
        '',
        '='.repeat(80),
        'Failure Details:',
        '='.repeat(80),
        '',
        ...failureSummary.flatMap((item, index) => {
          const header = `${index + 1}. ${item.filePath}`;
          const entries = item.entries.length === 0
            ? ['   (No failure messages captured)']
            : item.entries.map(entry => `   • ${entry.title}\n     ${entry.message}`);
          return [header, ...entries, ''];
        })
      ] : [])
    ].join('\n');

    fs.writeFileSync(logPath, logContent, 'utf8');

    let historicalFailurePath = null;
    if (failureSummary.length > 0) {
      historicalFailurePath = path.join(testlogsDir, `${logBaseName}.failures.json`);
      fs.writeFileSync(historicalFailurePath, JSON.stringify(failureSummaryPayload, null, 2), 'utf8');
    }

    if (verbose) {
      console.log(`📋 Text log written to: ${logPath}\n`);
    } else {
      const relativeLogPath = path.relative(process.cwd(), logPath);
      let summaryLine = `${aggregatedResult.numFailedTests > 0 ? '❌' : '✅'} ${suiteName} tests — ${aggregatedResult.numPassedTests}/${aggregatedResult.numTotalTests} passed (${aggregatedResult.numFailedTests} failed) across ${aggregatedResult.numTotalTestSuites} files in ${totalTime.toFixed(2)}s. Log: ${relativeLogPath}`;
      if (failureSummary.length > 0) {
        const failureTargets = [path.relative(process.cwd(), failureSummaryPath)];
        if (historicalFailurePath) {
          failureTargets.push(path.relative(process.cwd(), historicalFailurePath));
        }
        summaryLine += ` | failures logged (${failureSummary.length}) → ${failureTargets.join(' & ')}`;
      }
      console.log(summaryLine);
    }
  }


  _getEmojiForTime(seconds) {
    if (seconds > 30) return '🐌🐌🐌'; // Super slow
    if (seconds > 10) return '🐌🐌';   // Very slow
    if (seconds > 5) return '🐌';      // Slow
    if (seconds > 2) return '⏳';      // Medium
    return '⚡';                        // Fast
  }

  _collectFailureSummary() {
    return this._testResults
      .filter(result => result.numFailing > 0)
      .map(result => ({
        filePath: result.filePath,
        runtime: result.runtime,
        numFailing: result.numFailing,
        entries: result.failures
      }));
  }

  _condenseFailureMessage(message) {
    if (!message) {
      return '';
    }
    const stripped = this._stripAnsi(message)
      .split('\n')
      .map(line => line.trim())
      .filter(Boolean)
      .slice(0, 3)
      .join(' ');
    if (stripped.length > 240) {
      return `${stripped.slice(0, 237)}...`;
    }
    return stripped;
  }

  _stripAnsi(value) {
    return (value || '').replace(/\u001b\[[0-9;]*m/g, '');
  }

  _resolveSuiteName(aggregatedResult) {
    const explicit = process.env.TEST_SUITE_NAME;
    if (explicit && explicit.trim()) {
      return this._sanitizeLabel(explicit.trim());
    }

    const pattern = this._globalConfig?.testPathPattern;
    if (pattern) {
      return this._sanitizeLabel(`pattern-${pattern}`);
    }

    const namePattern = this._globalConfig?.testNamePattern;
    if (namePattern) {
      return this._sanitizeLabel(`name-${namePattern}`);
    }

    if (aggregatedResult?.numTotalTestSuites === 1 && this._testResults?.length === 1) {
      const single = path.basename(this._testResults[0].filePath).replace(/\..+$/, '');
      return this._sanitizeLabel(`single-${single}`);
    }

    return 'ALL';
  }

  _sanitizeLabel(value) {
    return value
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      || 'all';
  }
}

module.exports = TimingReporter;
