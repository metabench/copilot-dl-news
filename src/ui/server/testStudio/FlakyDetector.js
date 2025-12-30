'use strict';

/**
 * Flaky Test Detector
 * Identifies tests that intermittently pass/fail
 * @module ui/server/testStudio/FlakyDetector
 */

/**
 * FlakyDetector - Analyzes test history to find flaky tests
 */
class FlakyDetector {
  /**
   * Create a FlakyDetector
   * @param {TestResultService} resultService - Test result service
   * @param {Object} options - Options
   */
  constructor(resultService, options = {}) {
    this.resultService = resultService;
    this.runLimit = options.runLimit || 10;
    this.flakyThresholdMin = options.flakyThresholdMin || 0.1;
    this.flakyThresholdMax = options.flakyThresholdMax || 0.9;
  }

  /**
   * Calculate flaky score for a test
   * Score = failCount / (passCount + failCount)
   * Score between 0.1 and 0.9 indicates flaky test
   * @param {Array} history - Test run history
   * @returns {Object} Flaky analysis
   */
  calculateFlakyScore(history) {
    if (!history || history.length < 2) {
      return { score: 0, isFlaky: false, confidence: 'low' };
    }

    const passed = history.filter(h => h.status === 'passed').length;
    const failed = history.filter(h => h.status === 'failed').length;
    const total = passed + failed;

    if (total === 0) {
      return { score: 0, isFlaky: false, confidence: 'low' };
    }

    const score = failed / total;
    const isFlaky = score > this.flakyThresholdMin && score < this.flakyThresholdMax;
    
    // Confidence based on sample size
    let confidence = 'low';
    if (history.length >= 5) confidence = 'medium';
    if (history.length >= 10) confidence = 'high';

    return {
      score: Math.round(score * 100) / 100,
      isFlaky,
      confidence,
      passCount: passed,
      failCount: failed,
      totalRuns: history.length
    };
  }

  /**
   * Analyze a single test for flakiness
   * @param {string} file - File path
   * @param {string} testName - Test name
   * @returns {Promise<Object>} Analysis result
   */
  async analyzeTest(file, testName) {
    const history = await this.resultService.getTestHistory(file, testName, this.runLimit);
    const analysis = this.calculateFlakyScore(history);
    
    return {
      file,
      testName,
      ...analysis,
      history: history.map(h => ({
        status: h.status,
        runId: h.runId || h.run_id,
        timestamp: h.timestamp
      }))
    };
  }

  /**
   * Get all flaky tests
   * @param {Object} options - Options
   * @returns {Promise<Array>} Flaky tests sorted by score
   */
  async getFlakyTests(options = {}) {
    const limit = options.limit || 20;
    
    // Get recent runs
    const runs = await this.resultService.listRuns({ limit: this.runLimit });
    
    if (runs.length < 2) {
      return [];
    }

    // Collect all unique tests from recent runs
    const testMap = new Map(); // key: file|testName -> history array
    
    for (const run of runs) {
      const runId = run.runId || run.run_id;
      const results = await this.resultService.getResults(runId, { limit: 10000 });
      
      for (const result of results) {
        const file = result.file;
        const testName = result.testName || result.test_name;
        const key = `${file}|${testName}`;
        
        if (!testMap.has(key)) {
          testMap.set(key, []);
        }
        
        testMap.get(key).push({
          status: result.status,
          runId,
          timestamp: run.timestamp
        });
      }
    }

    // Calculate flaky scores
    const flakyTests = [];
    
    for (const [key, history] of testMap) {
      const [file, testName] = key.split('|');
      const analysis = this.calculateFlakyScore(history);
      
      if (analysis.isFlaky) {
        flakyTests.push({
          file,
          testName,
          ...analysis
        });
      }
    }

    // Sort by flaky score (closest to 0.5 is most flaky)
    flakyTests.sort((a, b) => {
      const aDistance = Math.abs(a.score - 0.5);
      const bDistance = Math.abs(b.score - 0.5);
      return aDistance - bDistance;
    });

    return flakyTests.slice(0, limit);
  }

  /**
   * Get flaky test summary
   * @returns {Promise<Object>} Summary stats
   */
  async getSummary() {
    const flakyTests = await this.getFlakyTests({ limit: 1000 });
    
    const byConfidence = {
      high: flakyTests.filter(t => t.confidence === 'high').length,
      medium: flakyTests.filter(t => t.confidence === 'medium').length,
      low: flakyTests.filter(t => t.confidence === 'low').length
    };

    const avgScore = flakyTests.length > 0
      ? flakyTests.reduce((sum, t) => sum + t.score, 0) / flakyTests.length
      : 0;

    return {
      totalFlaky: flakyTests.length,
      byConfidence,
      avgScore: Math.round(avgScore * 100) / 100,
      mostFlaky: flakyTests.slice(0, 5)
    };
  }

  /**
   * Detect newly flaky tests (became flaky in recent runs)
   * @param {number} recentRuns - Number of recent runs to check
   * @returns {Promise<Array>} Newly flaky tests
   */
  async detectNewlyFlaky(recentRuns = 5) {
    const flakyTests = await this.getFlakyTests({ limit: 1000 });
    
    // Filter to tests where first failures are in recent runs
    return flakyTests.filter(test => {
      if (!test.history || test.history.length < recentRuns) return false;
      
      // Check if all older runs passed
      const olderRuns = test.history.slice(recentRuns);
      const allOlderPassed = olderRuns.every(h => h.status === 'passed');
      
      // Check if recent runs have failures
      const recentRunsData = test.history.slice(0, recentRuns);
      const hasRecentFailures = recentRunsData.some(h => h.status === 'failed');
      
      return allOlderPassed && hasRecentFailures;
    });
  }

  /**
   * Get stabilized tests (were flaky but now consistent)
   * @param {number} recentRuns - Number of recent runs to check
   * @returns {Promise<Array>} Stabilized tests
   */
  async detectStabilized(recentRuns = 5) {
    const runs = await this.resultService.listRuns({ limit: this.runLimit + recentRuns });
    
    if (runs.length < recentRuns + 2) {
      return [];
    }

    // Get tests from older runs that were flaky
    // but have been consistent in recent runs
    // This requires more history than we typically store
    // Simplified implementation: return empty for now
    return [];
  }
}

module.exports = FlakyDetector;
