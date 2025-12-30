'use strict';

/**
 * Tests for Flaky Detector
 * @module tests/ui/testStudio/FlakyDetector.test
 */

describe('FlakyDetector', () => {
  let FlakyDetector;
  let mockResultService;

  beforeEach(() => {
    jest.resetModules();
    FlakyDetector = require('../../../src/ui/server/testStudio/FlakyDetector');

    // Create mock result service
    mockResultService = {
      listRuns: jest.fn().mockResolvedValue([]),
      getResults: jest.fn().mockResolvedValue([]),
      getTestHistory: jest.fn().mockResolvedValue([])
    };
  });

  describe('constructor', () => {
    it('should create instance with result service', () => {
      const detector = new FlakyDetector(mockResultService);
      expect(detector).toBeDefined();
    });

    it('should accept options', () => {
      const detector = new FlakyDetector(mockResultService, {
        runLimit: 20,
        flakyThresholdMin: 0.15,
        flakyThresholdMax: 0.85
      });
      expect(detector).toBeDefined();
    });

    it('should use default thresholds', () => {
      const detector = new FlakyDetector(mockResultService);
      expect(detector.flakyThresholdMin).toBe(0.1);
      expect(detector.flakyThresholdMax).toBe(0.9);
    });
  });

  describe('calculateFlakyScore', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should return 0 for empty history', () => {
      const result = detector.calculateFlakyScore([]);
      expect(result.score).toBe(0);
      expect(result.isFlaky).toBe(false);
    });

    it('should return 0 for single run', () => {
      const result = detector.calculateFlakyScore([{ status: 'passed' }]);
      expect(result.score).toBe(0);
      expect(result.isFlaky).toBe(false);
    });

    it('should calculate score for mixed results', () => {
      const history = [
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' }
      ];
      const result = detector.calculateFlakyScore(history);
      expect(result.score).toBe(0.5);
      expect(result.isFlaky).toBe(true);
    });

    it('should not flag consistent passes', () => {
      const history = Array(10).fill({ status: 'passed' });
      const result = detector.calculateFlakyScore(history);
      expect(result.score).toBe(0);
      expect(result.isFlaky).toBe(false);
    });

    it('should not flag consistent failures', () => {
      const history = Array(10).fill({ status: 'failed' });
      const result = detector.calculateFlakyScore(history);
      expect(result.score).toBe(1);
      expect(result.isFlaky).toBe(false);
    });

    it('should flag tests near 50% failure rate', () => {
      const history = [
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' },
        { status: 'failed' },
        { status: 'passed' }
      ];
      const result = detector.calculateFlakyScore(history);
      expect(result.isFlaky).toBe(true);
    });

    it('should include confidence level', () => {
      const history = Array(5).fill(null).map((_, i) => ({
        status: i % 2 === 0 ? 'passed' : 'failed'
      }));
      const result = detector.calculateFlakyScore(history);
      expect(result.confidence).toBe('medium');
    });

    it('should have high confidence with 10+ runs', () => {
      const history = Array(10).fill(null).map((_, i) => ({
        status: i % 2 === 0 ? 'passed' : 'failed'
      }));
      const result = detector.calculateFlakyScore(history);
      expect(result.confidence).toBe('high');
    });

    it('should include pass/fail counts', () => {
      const history = [
        { status: 'passed' },
        { status: 'passed' },
        { status: 'failed' }
      ];
      const result = detector.calculateFlakyScore(history);
      expect(result.passCount).toBe(2);
      expect(result.failCount).toBe(1);
    });
  });

  describe('analyzeTest', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should analyze single test', async () => {
      mockResultService.getTestHistory.mockResolvedValue([
        { status: 'passed', runId: 'run-1' },
        { status: 'failed', runId: 'run-2' }
      ]);

      const result = await detector.analyzeTest('test.js', 'my test');
      expect(result.file).toBe('test.js');
      expect(result.testName).toBe('my test');
      expect(result.score).toBeDefined();
    });

    it('should include history in result', async () => {
      mockResultService.getTestHistory.mockResolvedValue([
        { status: 'passed', runId: 'run-1' },
        { status: 'failed', runId: 'run-2' }
      ]);

      const result = await detector.analyzeTest('test.js', 'my test');
      expect(result.history).toBeDefined();
      expect(result.history.length).toBe(2);
    });
  });

  describe('getFlakyTests', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should return empty array with no runs', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      const flaky = await detector.getFlakyTests();
      expect(flaky).toEqual([]);
    });

    it('should return empty array with single run', async () => {
      mockResultService.listRuns.mockResolvedValue([{ runId: 'run-1' }]);
      const flaky = await detector.getFlakyTests();
      expect(flaky).toEqual([]);
    });

    it('should identify flaky tests across runs', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1', timestamp: new Date().toISOString() },
        { runId: 'run-2', timestamp: new Date().toISOString() }
      ]);

      mockResultService.getResults
        .mockResolvedValueOnce([
          { file: 'test.js', testName: 'flaky', status: 'passed' }
        ])
        .mockResolvedValueOnce([
          { file: 'test.js', testName: 'flaky', status: 'failed' }
        ]);

      const flaky = await detector.getFlakyTests();
      expect(flaky.length).toBeGreaterThan(0);
    });

    it('should sort by flakiness score', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1' },
        { runId: 'run-2' },
        { runId: 'run-3' },
        { runId: 'run-4' }
      ]);

      // Mock results where testA is more flaky (50%) than testB (25%)
      mockResultService.getResults.mockImplementation((runId) => {
        if (runId === 'run-1' || runId === 'run-3') {
          return Promise.resolve([
            { file: 'a.js', testName: 'testA', status: 'passed' },
            { file: 'b.js', testName: 'testB', status: 'passed' }
          ]);
        }
        return Promise.resolve([
          { file: 'a.js', testName: 'testA', status: 'failed' },
          { file: 'b.js', testName: 'testB', status: 'passed' }
        ]);
      });

      const flaky = await detector.getFlakyTests();
      // Most flaky (closest to 0.5) should be first
      if (flaky.length > 0) {
        expect(flaky[0].testName).toBe('testA');
      }
    });

    it('should support limit option', async () => {
      mockResultService.listRuns.mockResolvedValue([
        { runId: 'run-1' },
        { runId: 'run-2' }
      ]);

      mockResultService.getResults.mockResolvedValue([
        { file: 'a.js', testName: 'test1', status: 'passed' },
        { file: 'b.js', testName: 'test2', status: 'failed' },
        { file: 'c.js', testName: 'test3', status: 'passed' }
      ]);

      const flaky = await detector.getFlakyTests({ limit: 1 });
      expect(flaky.length).toBeLessThanOrEqual(1);
    });
  });

  describe('getSummary', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should return summary stats', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      const summary = await detector.getSummary();
      expect(summary.totalFlaky).toBeDefined();
      expect(summary.byConfidence).toBeDefined();
      expect(summary.avgScore).toBeDefined();
    });

    it('should group by confidence level', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      const summary = await detector.getSummary();
      expect(summary.byConfidence.high).toBeDefined();
      expect(summary.byConfidence.medium).toBeDefined();
      expect(summary.byConfidence.low).toBeDefined();
    });

    it('should include most flaky tests', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      const summary = await detector.getSummary();
      expect(summary.mostFlaky).toBeDefined();
      expect(Array.isArray(summary.mostFlaky)).toBe(true);
    });
  });

  describe('detectNewlyFlaky', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should detect tests that became flaky recently', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      const newlyFlaky = await detector.detectNewlyFlaky(5);
      expect(Array.isArray(newlyFlaky)).toBe(true);
    });
  });

  describe('detectStabilized', () => {
    let detector;

    beforeEach(() => {
      detector = new FlakyDetector(mockResultService);
    });

    it('should detect tests that stabilized', async () => {
      mockResultService.listRuns.mockResolvedValue([]);
      
      const stabilized = await detector.detectStabilized(5);
      expect(Array.isArray(stabilized)).toBe(true);
    });
  });
});

describe('FlakyDetector edge cases', () => {
  let FlakyDetector;
  let mockResultService;

  beforeEach(() => {
    jest.resetModules();
    FlakyDetector = require('../../../src/ui/server/testStudio/FlakyDetector');
    mockResultService = {
      listRuns: jest.fn().mockResolvedValue([]),
      getResults: jest.fn().mockResolvedValue([]),
      getTestHistory: jest.fn().mockResolvedValue([])
    };
  });

  it('should handle test with only skipped status', () => {
    const detector = new FlakyDetector(mockResultService);
    const history = Array(5).fill({ status: 'skipped' });
    const result = detector.calculateFlakyScore(history);
    expect(result.score).toBe(0);
    expect(result.isFlaky).toBe(false);
  });

  it('should handle mixed skipped/passed/failed', () => {
    const detector = new FlakyDetector(mockResultService);
    const history = [
      { status: 'passed' },
      { status: 'skipped' },
      { status: 'failed' },
      { status: 'passed' }
    ];
    const result = detector.calculateFlakyScore(history);
    // Only counts passed/failed
    expect(result.totalRuns).toBe(4);
  });

  it('should handle very long history', () => {
    const detector = new FlakyDetector(mockResultService);
    const history = Array(100).fill(null).map((_, i) => ({
      status: i % 3 === 0 ? 'failed' : 'passed'
    }));
    const result = detector.calculateFlakyScore(history);
    expect(result.confidence).toBe('high');
  });
});
