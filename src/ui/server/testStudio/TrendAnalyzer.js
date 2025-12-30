'use strict';

/**
 * Test Trend Analyzer
 * Analyzes test pass rates and duration trends
 * @module ui/server/testStudio/TrendAnalyzer
 */

/**
 * TrendAnalyzer - Analyzes test result trends over time
 */
class TrendAnalyzer {
  /**
   * Create a TrendAnalyzer
   * @param {TestResultService} resultService - Test result service
   */
  constructor(resultService) {
    this.resultService = resultService;
  }

  /**
   * Get pass rate trend over time
   * @param {Object} options - Options
   * @returns {Promise<Array>} Trend data points
   */
  async getPassRateTrend(options = {}) {
    const limit = options.limit || 30;
    const groupBy = options.groupBy || 'run'; // run, day, week
    
    const runs = await this.resultService.listRuns({ limit });
    const dataPoints = [];

    for (const run of runs) {
      const runId = run.runId || run.run_id;
      const stats = await this.resultService.getStats(runId);
      
      dataPoints.push({
        runId,
        timestamp: run.timestamp,
        date: this.formatDate(run.timestamp, groupBy),
        totalTests: stats.total,
        passed: stats.passed,
        failed: stats.failed,
        skipped: stats.skipped || 0,
        passRate: stats.total > 0 ? Math.round((stats.passed / stats.total) * 10000) / 100 : 0,
        duration: stats.duration || run.duration || 0
      });
    }

    // Group by date if requested
    if (groupBy !== 'run') {
      return this.groupByDate(dataPoints, groupBy);
    }

    return dataPoints;
  }

  /**
   * Format date based on grouping
   * @param {string|Date} timestamp - Timestamp
   * @param {string} groupBy - Grouping type
   * @returns {string} Formatted date
   */
  formatDate(timestamp, groupBy) {
    const date = new Date(timestamp);
    
    if (groupBy === 'day') {
      return date.toISOString().split('T')[0];
    }
    
    if (groupBy === 'week') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - date.getDay());
      return weekStart.toISOString().split('T')[0];
    }
    
    return date.toISOString();
  }

  /**
   * Group data points by date
   * @param {Array} dataPoints - Data points
   * @param {string} groupBy - Grouping type
   * @returns {Array} Grouped data
   */
  groupByDate(dataPoints, groupBy) {
    const groups = new Map();

    for (const point of dataPoints) {
      const key = point.date;
      
      if (!groups.has(key)) {
        groups.set(key, {
          date: key,
          runs: [],
          totalTests: 0,
          passed: 0,
          failed: 0,
          skipped: 0,
          duration: 0
        });
      }

      const group = groups.get(key);
      group.runs.push(point.runId);
      group.totalTests += point.totalTests;
      group.passed += point.passed;
      group.failed += point.failed;
      group.skipped += point.skipped;
      group.duration += point.duration;
    }

    return Array.from(groups.values()).map(group => ({
      ...group,
      runCount: group.runs.length,
      avgPassRate: group.totalTests > 0 
        ? Math.round((group.passed / group.totalTests) * 10000) / 100 
        : 0,
      avgDuration: group.runs.length > 0 
        ? Math.round(group.duration / group.runs.length) 
        : 0
    }));
  }

  /**
   * Get duration trend
   * @param {Object} options - Options
   * @returns {Promise<Array>} Duration data points
   */
  async getDurationTrend(options = {}) {
    const limit = options.limit || 30;
    const runs = await this.resultService.listRuns({ limit });
    
    return runs.map(run => ({
      runId: run.runId || run.run_id,
      timestamp: run.timestamp,
      duration: run.duration || 0
    }));
  }

  /**
   * Get test count trend
   * @param {Object} options - Options
   * @returns {Promise<Array>} Test count data points
   */
  async getTestCountTrend(options = {}) {
    const limit = options.limit || 30;
    const runs = await this.resultService.listRuns({ limit });
    const dataPoints = [];

    for (const run of runs) {
      const runId = run.runId || run.run_id;
      const stats = await this.resultService.getStats(runId);
      
      dataPoints.push({
        runId,
        timestamp: run.timestamp,
        totalTests: stats.total,
        newTests: 0, // Would require comparing with previous run
        removedTests: 0
      });
    }

    // Calculate new/removed tests by comparing adjacent runs
    for (let i = 0; i < dataPoints.length - 1; i++) {
      const current = dataPoints[i];
      const previous = dataPoints[i + 1];
      current.newTests = Math.max(0, current.totalTests - previous.totalTests);
      current.removedTests = Math.max(0, previous.totalTests - current.totalTests);
    }

    return dataPoints;
  }

  /**
   * Get slowest tests trend
   * @param {number} topN - Number of slowest tests
   * @param {Object} options - Options
   * @returns {Promise<Array>} Slowest tests with history
   */
  async getSlowestTestsTrend(topN = 10, options = {}) {
    const runsLimit = options.runsLimit || 10;
    const runs = await this.resultService.listRuns({ limit: runsLimit });
    
    if (runs.length === 0) return [];

    // Get most recent run's slowest tests
    const latestRunId = runs[0].runId || runs[0].run_id;
    const results = await this.resultService.getResults(latestRunId, { limit: 10000 });
    
    // Sort by duration
    const sorted = results
      .filter(r => r.duration != null)
      .sort((a, b) => (b.duration || 0) - (a.duration || 0));

    const slowest = sorted.slice(0, topN);

    // Get history for each slow test
    const withHistory = [];
    for (const test of slowest) {
      const file = test.file;
      const testName = test.testName || test.test_name;
      const history = await this.resultService.getTestHistory(file, testName, runsLimit);
      
      withHistory.push({
        file,
        testName,
        currentDuration: test.duration,
        avgDuration: history.length > 0
          ? Math.round(history.reduce((sum, h) => sum + (h.duration || 0), 0) / history.length)
          : test.duration,
        maxDuration: Math.max(...history.map(h => h.duration || 0), test.duration),
        minDuration: Math.min(...history.map(h => h.duration || 0), test.duration),
        history: history.map(h => ({
          runId: h.runId || h.run_id,
          duration: h.duration,
          timestamp: h.timestamp
        }))
      });
    }

    return withHistory;
  }

  /**
   * Get failure trend by file
   * @param {Object} options - Options
   * @returns {Promise<Array>} Failure counts by file
   */
  async getFailuresByFile(options = {}) {
    const limit = options.limit || 10;
    const runs = await this.resultService.listRuns({ limit });
    
    const fileFailures = new Map();

    for (const run of runs) {
      const runId = run.runId || run.run_id;
      const results = await this.resultService.getResults(runId, { 
        status: 'failed',
        limit: 10000 
      });

      for (const result of results) {
        const file = result.file;
        if (!fileFailures.has(file)) {
          fileFailures.set(file, { file, failureCount: 0, runs: new Set() });
        }
        const entry = fileFailures.get(file);
        entry.failureCount++;
        entry.runs.add(runId);
      }
    }

    return Array.from(fileFailures.values())
      .map(entry => ({
        file: entry.file,
        failureCount: entry.failureCount,
        affectedRuns: entry.runs.size
      }))
      .sort((a, b) => b.failureCount - a.failureCount);
  }

  /**
   * Get comprehensive trend summary
   * @param {Object} options - Options
   * @returns {Promise<Object>} Trend summary
   */
  async getSummary(options = {}) {
    const passRateTrend = await this.getPassRateTrend({ limit: 10 });
    const durationTrend = await this.getDurationTrend({ limit: 10 });
    
    // Calculate trend direction
    const passRateDirection = this.calculateTrendDirection(
      passRateTrend.map(p => p.passRate)
    );
    
    const durationDirection = this.calculateTrendDirection(
      durationTrend.map(d => d.duration)
    );

    // Latest stats
    const latest = passRateTrend[0] || {};
    const oldest = passRateTrend[passRateTrend.length - 1] || {};

    return {
      currentPassRate: latest.passRate || 0,
      passRateChange: (latest.passRate || 0) - (oldest.passRate || 0),
      passRateTrend: passRateDirection,
      currentDuration: latest.duration || 0,
      durationChange: (latest.duration || 0) - (oldest.duration || 0),
      durationTrend: durationDirection,
      runsAnalyzed: passRateTrend.length,
      dateRange: {
        from: oldest.timestamp,
        to: latest.timestamp
      }
    };
  }

  /**
   * Calculate trend direction from values
   * @param {Array<number>} values - Values (newest first)
   * @returns {string} up, down, or stable
   */
  calculateTrendDirection(values) {
    if (values.length < 2) return 'stable';

    // Compare average of first half to second half
    const mid = Math.floor(values.length / 2);
    const recentAvg = values.slice(0, mid).reduce((a, b) => a + b, 0) / mid;
    const olderAvg = values.slice(mid).reduce((a, b) => a + b, 0) / (values.length - mid);

    const diff = recentAvg - olderAvg;
    const threshold = olderAvg * 0.05; // 5% change threshold

    if (diff > threshold) return 'up';
    if (diff < -threshold) return 'down';
    return 'stable';
  }
}

module.exports = TrendAnalyzer;
