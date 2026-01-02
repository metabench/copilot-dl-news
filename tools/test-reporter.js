'use strict';

/**
 * Jest Custom Reporter for Test Studio
 * Outputs test results in JSON format for Test Studio import
 * @module tools/test-reporter
 */

const fs = require('fs');
const path = require('path');

/**
 * Test Studio Reporter for Jest
 * Writes test results to JSON files for Test Studio consumption
 */
class TestStudioReporter {
  /**
   * Create a TestStudioReporter
   * @param {Object} globalConfig - Jest global config
   * @param {Object} options - Reporter options
   */
  constructor(globalConfig, options = {}) {
    this.globalConfig = globalConfig;
    this.options = options;
    this.outputDir = options.outputDir || 'data/test-results';
    this.runId = options.runId || this.generateRunId();
  }

  /**
   * Generate a run ID
   * @returns {string} Run ID
   */
  generateRunId() {
    const now = new Date();
    const date = now.toISOString().split('T')[0];
    const time = now.toISOString().split('T')[1].replace(/:/g, '').replace('Z', '').replace(/\./g, '').slice(0, 9);
    const nonce = Math.floor(Math.random() * 1e6).toString(16).padStart(5, '0');
    return `run-${date}-${time}-${nonce}`;
  }

  /**
   * Called when test run starts
   * @param {Object} results - Aggregate results
   * @param {Object} options - Options
   */
  onRunStart(results, options) {
    this.startTime = Date.now();
    this.testResults = [];
    this._testsByFile = new Map();
  }

  /**
   * Called for each test file
   * @param {Object} test - Test info
   * @param {Object} testResult - Test result
   * @param {Object} aggregatedResult - Aggregated result
   */
  onTestResult(test, testResult, aggregatedResult) {
    const file = path.relative(this.globalConfig.rootDir || process.cwd(), testResult.testFilePath);

    for (const result of testResult.testResults) {
      const normalized = {
        file,
        testName: result.fullName || result.title,
        status: this.mapStatus(result.status),
        durationMs: result.duration || 0,
        errorMessage: result.failureMessages?.join('\n') || null,
        errorStack: result.failureMessages?.join('\n') || null,
        ancestorTitles: result.ancestorTitles || [],
        retry: 0
      };

      this.testResults.push(normalized);

      const existing = this._testsByFile.get(file) || [];
      existing.push({
        name: normalized.testName,
        fullName: normalized.testName,
        status: normalized.status,
        durationMs: normalized.durationMs,
        errorMessage: normalized.errorMessage,
        errorStack: normalized.errorStack
      });
      this._testsByFile.set(file, existing);
    }
  }

  /**
   * Map Jest status to Test Studio status
   * @param {string} jestStatus - Jest status
   * @returns {string} Test Studio status
   */
  mapStatus(jestStatus) {
    const statusMap = {
      passed: 'passed',
      failed: 'failed',
      pending: 'skipped',
      skipped: 'skipped',
      todo: 'skipped',
      disabled: 'skipped'
    };
    return statusMap[jestStatus] || 'skipped';
  }

  /**
   * Called when test run completes
   * @param {Object} contexts - Test contexts
   * @param {Object} results - Aggregate results
   */
  onRunComplete(contexts, results) {
    const endTime = Date.now();
    const duration = endTime - this.startTime;

    const output = {
      format: 'test-studio-results@1',
      runId: this.runId,
      timestamp: new Date().toISOString(),
      durationMs: duration,
      source: 'jest',
      environment: {
        node: process.version,
        platform: process.platform,
        ci: !!process.env.CI
      },
      summary: {
        total: results.numTotalTests,
        passed: results.numPassedTests,
        failed: results.numFailedTests,
        skipped: results.numPendingTests + results.numTodoTests,
        suites: results.numTotalTestSuites
      },
      testResults: Array.from(this._testsByFile.entries()).map(([file, tests]) => ({
        file,
        tests
      })),
      results: this.testResults
    };

    this.writeOutput(output);
  }

  /**
   * Write output to file
   * @param {Object} output - Output data
   */
  writeOutput(output) {
    try {
      // Ensure output directory exists
      if (!fs.existsSync(this.outputDir)) {
        fs.mkdirSync(this.outputDir, { recursive: true });
      }

      const filename = `${output.runId || this.runId}.json`;
      const filepath = path.join(this.outputDir, filename);

      fs.writeFileSync(filepath, JSON.stringify(output, null, 2));

      // Also write to latest.json for easy access
      const latestPath = path.join(this.outputDir, 'latest.json');
      fs.writeFileSync(latestPath, JSON.stringify(output, null, 2));

      console.log(`\n📊 Test Studio: Results written to ${filepath}`);
    } catch (error) {
      console.error('Test Studio Reporter: Failed to write results', error.message);
    }
  }

  /**
   * Get last error
   * @returns {Error|null} Last error
   */
  getLastError() {
    return null;
  }
}

/**
 * Import results from a JSON file
 * @param {string} filepath - Path to JSON file
 * @returns {Object} Parsed results
 */
function importFromFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  return JSON.parse(content);
}

/**
 * List all result files in a directory
 * @param {string} dir - Directory path
 * @returns {Array<string>} File paths
 */
function listResultFiles(dir = 'data/test-results') {
  if (!fs.existsSync(dir)) return [];
  
  return fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && f !== 'latest.json')
    .map(f => path.join(dir, f))
    .sort()
    .reverse();
}

/**
 * Get latest results
 * @param {string} dir - Directory path
 * @returns {Object|null} Latest results
 */
function getLatestResults(dir = 'data/test-results') {
  const latestPath = path.join(dir, 'latest.json');
  if (!fs.existsSync(latestPath)) return null;
  return importFromFile(latestPath);
}

/**
 * Prune old result files
 * @param {string} dir - Directory path
 * @param {number} keep - Number of files to keep
 * @returns {number} Number of files deleted
 */
function pruneOldResults(dir = 'data/test-results', keep = 50) {
  const files = listResultFiles(dir);
  const toDelete = files.slice(keep);
  
  let deleted = 0;
  for (const file of toDelete) {
    try {
      fs.unlinkSync(file);
      deleted++;
    } catch (e) {
      // Ignore deletion errors
    }
  }
  
  return deleted;
}

// Export both as default class and helpers
module.exports = TestStudioReporter;
module.exports.TestStudioReporter = TestStudioReporter;
module.exports.importFromFile = importFromFile;
module.exports.listResultFiles = listResultFiles;
module.exports.getLatestResults = getLatestResults;
module.exports.pruneOldResults = pruneOldResults;
