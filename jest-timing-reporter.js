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
  }

  onRunStart() {
    this._startTime = Date.now();
    console.log('\n⏱️  Jest Timing Reporter - Tracking test execution times...\n');
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
      perfStats: testResult.perfStats
    };
    
    this._testResults.push(result);
    
    // Display slow tests immediately (> 2 seconds)
    if (runtime > 2) {
      const emoji = runtime > 10 ? '🐌' : '⏳';
      console.log(`${emoji} ${runtime.toFixed(2)}s - ${testPath}`);
    }
  }

  onRunComplete(contexts, aggregatedResult) {
    const totalTime = (Date.now() - this._startTime) / 1000;
    
    // Sort by runtime (slowest first)
    this._testResults.sort((a, b) => b.runtime - a.runtime);
    
    // Prepare output
    const output = [];
    
    // Display top 20 slowest tests
    output.push('\n📊 Top 20 Slowest Tests:\n');
    output.push('─'.repeat(80));
    
    this._testResults.slice(0, 20).forEach((result, index) => {
      const emoji = this._getEmojiForTime(result.runtime);
      const passFail = result.numFailing > 0 ? '❌' : '✅';
      const line = `${index + 1}. ${emoji} ${result.runtime.toFixed(2)}s ${passFail} ${result.filePath}`;
      output.push(line);
      console.log(line);
    });
    
    output.push('─'.repeat(80));
    console.log('─'.repeat(80));
    
    // Display summary statistics
    const totalTestTime = this._testResults.reduce((sum, r) => sum + r.runtime, 0);
    const avgTestTime = totalTestTime / this._testResults.length;
    const slowTests = this._testResults.filter(r => r.runtime > 5).length;
    const verySlowTests = this._testResults.filter(r => r.runtime > 10).length;
    
    output.push('\n📈 Test Performance Summary:\n');
    output.push(`Total Runtime:        ${totalTime.toFixed(2)}s`);
    output.push(`Total Test Files:     ${this._testResults.length}`);
    output.push(`Average Test Time:    ${avgTestTime.toFixed(2)}s`);
    output.push(`Slow Tests (>5s):     ${slowTests} (${((slowTests/this._testResults.length)*100).toFixed(1)}%)`);
    output.push(`Very Slow Tests (>10s): ${verySlowTests} (${((verySlowTests/this._testResults.length)*100).toFixed(1)}%)`);
    
    console.log('\n📈 Test Performance Summary:\n');
    console.log(`Total Runtime:        ${totalTime.toFixed(2)}s`);
    console.log(`Total Test Files:     ${this._testResults.length}`);
    console.log(`Average Test Time:    ${avgTestTime.toFixed(2)}s`);
    console.log(`Slow Tests (>5s):     ${slowTests} (${((slowTests/this._testResults.length)*100).toFixed(1)}%)`);
    console.log(`Very Slow Tests (>10s): ${verySlowTests} (${((verySlowTests/this._testResults.length)*100).toFixed(1)}%)`);
    
    // Calculate time spent in different categories
    const puppeteerTime = this._testResults
      .filter(r => r.filePath.includes('puppeteer') || r.filePath.includes('e2e'))
      .reduce((sum, r) => sum + r.runtime, 0);
    
    const httpTime = this._testResults
      .filter(r => r.filePath.includes('http.test'))
      .reduce((sum, r) => sum + r.runtime, 0);
    
    const onlineTime = this._testResults
      .filter(r => r.filePath.includes('online'))
      .reduce((sum, r) => sum + r.runtime, 0);
    
    output.push('\n⏱️  Time by Category:\n');
    output.push(`E2E/Puppeteer Tests:  ${puppeteerTime.toFixed(2)}s (${((puppeteerTime/totalTestTime)*100).toFixed(1)}%)`);
    output.push(`HTTP Server Tests:    ${httpTime.toFixed(2)}s (${((httpTime/totalTestTime)*100).toFixed(1)}%)`);
    output.push(`Online API Tests:     ${onlineTime.toFixed(2)}s (${((onlineTime/totalTestTime)*100).toFixed(1)}%)`);
    
    console.log('\n⏱️  Time by Category:\n');
    console.log(`E2E/Puppeteer Tests:  ${puppeteerTime.toFixed(2)}s (${((puppeteerTime/totalTestTime)*100).toFixed(1)}%)`);
    console.log(`HTTP Server Tests:    ${httpTime.toFixed(2)}s (${((httpTime/totalTestTime)*100).toFixed(1)}%)`);
    console.log(`Online API Tests:     ${onlineTime.toFixed(2)}s (${((onlineTime/totalTestTime)*100).toFixed(1)}%)`);
    
    // Write JSON report
    const reportPath = path.join(process.cwd(), 'test-timing-report.json');
    const report = {
      timestamp: new Date().toISOString(),
      totalTime: totalTime,
      totalTestFiles: this._testResults.length,
      avgTestTime: avgTestTime,
      slowTests: slowTests,
      verySlowTests: verySlowTests,
      categoryTimes: {
        e2e: puppeteerTime,
        http: httpTime,
        online: onlineTime
      },
      testResults: this._testResults
    };
    
    fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
    console.log(`\n📄 Full timing report written to: ${reportPath}\n`);
    output.push(`\n📄 Full timing report written to: ${reportPath}\n`);
    
    // Write text log file with timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const logPath = path.join(process.cwd(), `test-timing-${timestamp}.log`);
    const logContent = [
      `Test Timing Report - ${new Date().toISOString()}`,
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
      )
    ].join('\n');
    
    fs.writeFileSync(logPath, logContent, 'utf8');
    console.log(`📋 Text log written to: ${logPath}\n`);
  }

  _getEmojiForTime(seconds) {
    if (seconds > 30) return '🐌🐌🐌'; // Super slow
    if (seconds > 10) return '🐌🐌';   // Very slow
    if (seconds > 5) return '🐌';      // Slow
    if (seconds > 2) return '⏳';      // Medium
    return '⚡';                        // Fast
  }
}

module.exports = TimingReporter;
