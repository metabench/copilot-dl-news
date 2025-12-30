'use strict';

/**
 * Tests for Trend Analyzer
 * @module tests/ui/testStudio/TrendAnalyzer.test
 */

describe('TrendAnalyzer', () => {
  let TrendAnalyzer;
  let mockResultService;

  beforeEach(() => {
    jest.resetModules();
    TrendAnalyzer = require('../../../src/ui/server/testStudio/TrendAnalyzer');

    mockResultService = {
      listRuns: jest.fn().mockResolvedValue([]),
      getResults: jest.fn().mockResolvedValue([]),
      getStats: jest.fn().mockResolvedValue({ total: 0, passed: 0, failed: 0 }),
      getTestHistory: jest.fn().mockResolvedValue([])
    };
  });

  describe('constructor', () => {
    it('should create instance with result service', () => {
      const analyzer = new TrendAnalyzer(mockResultService);
      expect(analyzer).toBeDefined();
    });
  });

  describe('getPassRateTrend', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return empty array with no runs', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      const trend = await analyzer.getPassRateTrend();
      expect(trend).toEqual([]);
    });

    it('should return trend data points', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-02T10:00:00Z' }
      ]);
      mockResultService.getStats
        .mockResolvedValueOnce({ total: 100, passed: 90, failed: 10 })
        .mockResolvedValueOnce({ total: 100, passed: 85, failed: 15 });

      const trend = await analyzer.getPassRateTrend();
      expect(trend.length).toBe(2);
    });

    it('should include pass rate in data points', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' }
      ]);
      mockResultService.getStats.mockResolvedValue({ 
        total: 100, passed: 90, failed: 10 
      });

      const trend = await analyzer.getPassRateTrend();
      expect(trend[0].passRate).toBe(90);
    });

    it('should support limit option', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-02T10:00:00Z' },
        { runId: 'run-3', timestamp: '2024-01-03T10:00:00Z' }
      ]);
      mockResultService.getStats.mockResolvedValue({ total: 10, passed: 10, failed: 0 });

      const trend = await analyzer.getPassRateTrend({ limit: 2 });
      // Limit is passed to listRuns
      expect(mockResultService.listRuns).toHaveBeenCalledWith({ limit: 2 });
    });

    it('should group by day when specified', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-01T14:00:00Z' },
        { runId: 'run-3', timestamp: '2024-01-02T10:00:00Z' }
      ]);
      mockResultService.getStats.mockResolvedValue({ total: 10, passed: 10, failed: 0 });

      const trend = await analyzer.getPassRateTrend({ groupBy: 'day' });
      expect(trend.length).toBe(2); // 2 days
    });

    it('should group by week when specified', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-08T10:00:00Z' }
      ]);
      mockResultService.getStats.mockResolvedValue({ total: 10, passed: 10, failed: 0 });

      const trend = await analyzer.getPassRateTrend({ groupBy: 'week' });
      expect(trend.length).toBe(2);
    });

    it('should include duration in data points', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z', duration: 5000 }
      ]);
      mockResultService.getStats.mockResolvedValue({ 
        total: 10, passed: 10, failed: 0, duration: 5000 
      });

      const trend = await analyzer.getPassRateTrend();
      expect(trend[0].duration).toBeDefined();
    });
  });

  describe('getDurationTrend', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return duration data points', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z', duration: 5000 },
        { runId: 'run-2', timestamp: '2024-01-02T10:00:00Z', duration: 6000 }
      ]);

      const trend = await analyzer.getDurationTrend();
      expect(trend.length).toBe(2);
      expect(trend[0].duration).toBe(5000);
    });

    it('should support limit option', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      await analyzer.getDurationTrend({ limit: 10 });
      expect(mockResultService.listRuns).toHaveBeenCalledWith({ limit: 10 });
    });
  });

  describe('getTestCountTrend', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return test count data points', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-02T10:00:00Z' }
      ]);
      mockResultService.getStats
        .mockResolvedValueOnce({ total: 100, passed: 90, failed: 10 })
        .mockResolvedValueOnce({ total: 95, passed: 85, failed: 10 });

      const trend = await analyzer.getTestCountTrend();
      expect(trend.length).toBe(2);
      expect(trend[0].totalTests).toBe(100);
    });

    it('should calculate new tests', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-02T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-01T10:00:00Z' }
      ]);
      mockResultService.getStats
        .mockResolvedValueOnce({ total: 105, passed: 100, failed: 5 })
        .mockResolvedValueOnce({ total: 100, passed: 95, failed: 5 });

      const trend = await analyzer.getTestCountTrend();
      expect(trend[0].newTests).toBe(5);
    });

    it('should calculate removed tests', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-02T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-01T10:00:00Z' }
      ]);
      mockResultService.getStats
        .mockResolvedValueOnce({ total: 95, passed: 90, failed: 5 })
        .mockResolvedValueOnce({ total: 100, passed: 95, failed: 5 });

      const trend = await analyzer.getTestCountTrend();
      expect(trend[0].removedTests).toBe(5);
    });
  });

  describe('getSlowestTestsTrend', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return empty with no runs', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      const slowest = await analyzer.getSlowestTestsTrend();
      expect(slowest).toEqual([]);
    });

    it('should return slowest tests', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z' }
      ]);
      mockResultService.getResults.mockResolvedValue([
        { file: 'slow.js', testName: 'slow test', duration: 5000 },
        { file: 'fast.js', testName: 'fast test', duration: 100 }
      ]);
      mockResultService.getTestHistory.mockResolvedValue([
        { duration: 5000, runId: 'run-1' }
      ]);

      const slowest = await analyzer.getSlowestTestsTrend(1);
      expect(slowest[0].testName).toBe('slow test');
    });

    it('should include history for slow tests', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1' }
      ]);
      mockResultService.getResults.mockResolvedValue([
        { file: 'slow.js', testName: 'slow test', duration: 5000 }
      ]);
      mockResultService.getTestHistory.mockResolvedValue([
        { duration: 5000, runId: 'run-1' },
        { duration: 4800, runId: 'run-2' }
      ]);

      const slowest = await analyzer.getSlowestTestsTrend(1);
      expect(slowest[0].history.length).toBeGreaterThan(0);
    });

    it('should calculate average duration', async () => {
      mockResultService.listRuns.mockResolvedValue([{ runId: 'run-1' }]);
      mockResultService.getResults.mockResolvedValue([
        { file: 'slow.js', testName: 'slow test', duration: 5000 }
      ]);
      mockResultService.getTestHistory.mockResolvedValue([
        { duration: 4000 },
        { duration: 5000 },
        { duration: 6000 }
      ]);

      const slowest = await analyzer.getSlowestTestsTrend(1);
      expect(slowest[0].avgDuration).toBe(5000);
    });
  });

  describe('getFailuresByFile', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return empty with no failures', async () => {
      mockResultService.listRuns.mockResolvedValue([{ runId: 'run-1' }]);
      mockResultService.getResults.mockResolvedValue([]);

      const failures = await analyzer.getFailuresByFile();
      expect(failures).toEqual([]);
    });

    it('should group failures by file', async () => {
      mockResultService.listRuns.mockResolvedValue([{ runId: 'run-1' }]);
      mockResultService.getResults.mockResolvedValue([
        { file: 'a.js', testName: 'test1', status: 'failed' },
        { file: 'a.js', testName: 'test2', status: 'failed' },
        { file: 'b.js', testName: 'test3', status: 'failed' }
      ]);

      const failures = await analyzer.getFailuresByFile();
      expect(failures[0].file).toBe('a.js');
      expect(failures[0].failureCount).toBe(2);
    });

    it('should sort by failure count descending', async () => {
      mockResultService.listRuns.mockResolvedValue([{ runId: 'run-1' }]);
      mockResultService.getResults.mockResolvedValue([
        { file: 'a.js', testName: 'test1', status: 'failed' },
        { file: 'b.js', testName: 'test2', status: 'failed' },
        { file: 'b.js', testName: 'test3', status: 'failed' }
      ]);

      const failures = await analyzer.getFailuresByFile();
      expect(failures[0].file).toBe('b.js');
    });

    it('should track affected runs', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1' },
        { runId: 'run-2' }
      ]);
      mockResultService.getResults
        .mockResolvedValueOnce([{ file: 'a.js', testName: 'test', status: 'failed' }])
        .mockResolvedValueOnce([{ file: 'a.js', testName: 'test', status: 'failed' }]);

      const failures = await analyzer.getFailuresByFile();
      expect(failures[0].affectedRuns).toBe(2);
    });
  });

  describe('getSummary', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return trend summary', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-01T10:00:00Z', duration: 5000 }
      ]);
      mockResultService.getStats.mockResolvedValue({
        total: 100, passed: 90, failed: 10
      });

      const summary = await analyzer.getSummary();
      expect(summary.currentPassRate).toBeDefined();
      expect(summary.passRateTrend).toBeDefined();
      expect(summary.currentDuration).toBeDefined();
    });

    it('should calculate pass rate change', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-02T10:00:00Z', duration: 5000 },
        { runId: 'run-2', timestamp: '2024-01-01T10:00:00Z', duration: 5000 }
      ]);
      mockResultService.getStats
        .mockResolvedValueOnce({ total: 100, passed: 95, failed: 5 })
        .mockResolvedValueOnce({ total: 100, passed: 90, failed: 10 });

      const summary = await analyzer.getSummary();
      expect(summary.passRateChange).toBe(5);
    });

    it('should include date range', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: '2024-01-02T10:00:00Z' },
        { runId: 'run-2', timestamp: '2024-01-01T10:00:00Z' }
      ]);
      mockResultService.getStats.mockResolvedValue({ total: 10, passed: 10, failed: 0 });

      const summary = await analyzer.getSummary();
      expect(summary.dateRange.from).toBeDefined();
      expect(summary.dateRange.to).toBeDefined();
    });
  });

  describe('calculateTrendDirection', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should return stable for single value', () => {
      const direction = analyzer.calculateTrendDirection([50]);
      expect(direction).toBe('stable');
    });

    it('should detect upward trend', () => {
      const direction = analyzer.calculateTrendDirection([100, 95, 90, 80]);
      expect(direction).toBe('up');
    });

    it('should detect downward trend', () => {
      const direction = analyzer.calculateTrendDirection([80, 85, 90, 95]);
      expect(direction).toBe('down');
    });

    it('should detect stable trend', () => {
      const direction = analyzer.calculateTrendDirection([50, 51, 50, 49]);
      expect(direction).toBe('stable');
    });

    it('should handle empty array', () => {
      const direction = analyzer.calculateTrendDirection([]);
      expect(direction).toBe('stable');
    });
  });

  describe('formatDate', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should format date for day grouping', () => {
      const formatted = analyzer.formatDate('2024-01-15T10:30:00Z', 'day');
      expect(formatted).toBe('2024-01-15');
    });

    it('should format date for week grouping', () => {
      const formatted = analyzer.formatDate('2024-01-15T10:30:00Z', 'week');
      expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    });

    it('should return ISO string for run grouping', () => {
      const formatted = analyzer.formatDate('2024-01-15T10:30:00Z', 'run');
      expect(formatted).toContain('2024-01-15');
    });
  });

  describe('groupByDate', () => {
    let analyzer;

    beforeEach(() => {
      analyzer = new TrendAnalyzer(mockResultService);
    });

    it('should group data points by date', () => {
      const dataPoints = [
        { date: '2024-01-01', runId: 'run-1', totalTests: 100, passed: 90, failed: 10, skipped: 0, duration: 1000 },
        { date: '2024-01-01', runId: 'run-2', totalTests: 100, passed: 95, failed: 5, skipped: 0, duration: 1000 },
        { date: '2024-01-02', runId: 'run-3', totalTests: 100, passed: 85, failed: 15, skipped: 0, duration: 1000 }
      ];

      const grouped = analyzer.groupByDate(dataPoints, 'day');
      expect(grouped.length).toBe(2);
    });

    it('should calculate average pass rate for group', () => {
      const dataPoints = [
        { date: '2024-01-01', runId: 'run-1', totalTests: 100, passed: 90, failed: 10, skipped: 0, duration: 1000 },
        { date: '2024-01-01', runId: 'run-2', totalTests: 100, passed: 80, failed: 20, skipped: 0, duration: 1000 }
      ];

      const grouped = analyzer.groupByDate(dataPoints, 'day');
      expect(grouped[0].avgPassRate).toBe(85); // (90+80)/2 = 85%
    });

    it('should include run count in group', () => {
      const dataPoints = [
        { date: '2024-01-01', runId: 'run-1', totalTests: 100, passed: 90, failed: 10, skipped: 0, duration: 1000 },
        { date: '2024-01-01', runId: 'run-2', totalTests: 100, passed: 80, failed: 20, skipped: 0, duration: 1000 }
      ];

      const grouped = analyzer.groupByDate(dataPoints, 'day');
      expect(grouped[0].runCount).toBe(2);
    });
  });
});
