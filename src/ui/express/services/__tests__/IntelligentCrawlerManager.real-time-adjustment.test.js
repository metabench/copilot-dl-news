/**
 * Tests for Real-Time Plan Adjustment (Phase 2 Improvement)
 */

const { IntelligentCrawlerManager } = require('../IntelligentCrawlerManager');
const Database = require('better-sqlite3');

describe('IntelligentCrawlerManager - Real-Time Plan Adjustment', () => {
  let db;
  let manager;
  let mockLogger;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Create minimal schema
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id INTEGER PRIMARY KEY,
        domain TEXT,
        status TEXT DEFAULT 'pending'
      );

      CREATE TABLE IF NOT EXISTS planning_sessions (
        session_id TEXT PRIMARY KEY,
        job_id INTEGER,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP
      );
    `);

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    const mockJobRegistry = {
      getJob: jest.fn((jobId) => ({
        id: jobId,
        domain: 'example.com',
        status: 'running'
      }))
    };

    manager = new IntelligentCrawlerManager({ 
      logger: mockLogger,
      features: { realTimePlanAdjustment: true }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('_extractPathPattern', () => {
    test('extracts first two path segments', () => {
      const pattern = manager._extractPathPattern('https://example.com/news/articles/123');
      expect(pattern).toBe('/news/articles/');
    });

    test('handles single segment', () => {
      const pattern = manager._extractPathPattern('https://example.com/news');
      expect(pattern).toBe('/news/');
    });

    test('handles root path', () => {
      const pattern = manager._extractPathPattern('https://example.com/');
      expect(pattern).toBe('//'); // Empty pathParts → '//'
    });

    test('handles no path', () => {
      const pattern = manager._extractPathPattern('https://example.com');
      expect(pattern).toBe('//'); // Empty pathParts → '//'
    });

    test('handles malformed URLs gracefully', () => {
      const pattern1 = manager._extractPathPattern('not-a-url');
      const pattern2 = manager._extractPathPattern('');
      const pattern3 = manager._extractPathPattern(null);
      
      expect(pattern1).toBe('/');
      expect(pattern2).toBe('/');
      expect(pattern3).toBe('/');
    });

    test('ignores query parameters', () => {
      const pattern = manager._extractPathPattern('https://example.com/news/articles?page=2');
      expect(pattern).toBe('/news/articles/');
    });

    test('ignores hash fragments', () => {
      const pattern = manager._extractPathPattern('https://example.com/news/articles#section');
      expect(pattern).toBe('/news/articles/');
    });
  });

  describe('_isSimilarStep', () => {
    test('returns true for same action + same pattern', () => {
      const step1 = { action: { type: 'explore', url: 'https://example.com/news/tech/article1' } };
      const step2 = { action: { type: 'explore', url: 'https://example.com/news/tech/article2' } };
      
      expect(manager._isSimilarStep(step1, step2)).toBe(true);
    });

    test('returns false for different actions', () => {
      const step1 = { action: { type: 'explore', url: 'https://example.com/news/tech/article1' } };
      const step2 = { action: { type: 'collect', url: 'https://example.com/news/tech/article2' } };
      
      expect(manager._isSimilarStep(step1, step2)).toBe(false);
    });

    test('returns false for different patterns', () => {
      const step1 = { action: { type: 'explore', url: 'https://example.com/news/tech/article1' } };
      const step2 = { action: { type: 'explore', url: 'https://example.com/sports/football/article2' } };
      
      expect(manager._isSimilarStep(step1, step2)).toBe(false);
    });

    test('returns true for similar paths with different IDs', () => {
      const step1 = { action: { type: 'explore', url: 'https://example.com/category/tech/123' } };
      const step2 = { action: { type: 'explore', url: 'https://example.com/category/tech/456' } };
      
      expect(manager._isSimilarStep(step1, step2)).toBe(true);
    });

    test('handles missing URLs gracefully', () => {
      const step1 = { action: { type: 'explore', url: 'https://example.com/news' } };
      const step2 = { action: { type: 'explore' } }; // No URL
      
      expect(manager._isSimilarStep(step1, step2)).toBe(false);
    });
  });

  describe('_adjustSimilarSteps', () => {
    test('boosts priority for excellent performance', () => {
      const execution = {
        currentStep: 1,
        plan: {
          steps: [
            { idx: 0, action: { type: 'explore', url: 'https://example.com/news/tech/article1' }, priority: 100 },
            { idx: 1, action: { type: 'explore', url: 'https://example.com/news/tech/article2' }, priority: 80 },
            { idx: 2, action: { type: 'explore', url: 'https://example.com/news/tech/article3' }, priority: 90 }
          ]
        }
      };

      manager._adjustSimilarSteps(execution, 0, 20, 'boost');

      // Steps 1 and 2 should be boosted (similar pattern: /news/tech/)
      expect(execution.plan.steps[1].priority).toBe(100); // 80 + 20
      expect(execution.plan.steps[2].priority).toBe(110); // 90 + 20
    });

    test('penalizes priority for poor performance', () => {
      const execution = {
        currentStep: 1,
        plan: {
          steps: [
            { idx: 0, action: { type: 'explore', url: 'https://example.com/category/tech/page1' }, priority: 100 },
            { idx: 1, action: { type: 'explore', url: 'https://example.com/category/tech/page2' }, priority: 80 },
            { idx: 2, action: { type: 'explore', url: 'https://example.com/category/tech/page3' }, priority: 90 }
          ]
        }
      };

      manager._adjustSimilarSteps(execution, 0, -15, 'penalize');

      expect(execution.plan.steps[1].priority).toBe(65); // 80 - 15
      expect(execution.plan.steps[2].priority).toBe(75); // 90 - 15
    });

    test('skips adjustment for dissimilar steps', () => {
      const execution = {
        currentStep: 1,
        plan: {
          steps: [
            { idx: 0, action: { type: 'explore', url: 'https://example.com/news/tech' }, priority: 100 },
            { idx: 1, action: { type: 'collect', url: 'https://example.com/article/123' }, priority: 80 }
          ]
        }
      };

      manager._adjustSimilarSteps(execution, 0, 20, 'boost');

      // Different action, should not adjust
      expect(execution.plan.steps[1].priority).toBe(80);
    });

    test('only adjusts future steps', () => {
      const execution = {
        currentStep: 2,
        plan: {
          steps: [
            { idx: 0, action: { type: 'explore', url: 'https://example.com/news/tech/1' }, priority: 100 },
            { idx: 1, action: { type: 'explore', url: 'https://example.com/news/tech/2' }, priority: 80, completed: true },
            { idx: 2, action: { type: 'explore', url: 'https://example.com/news/tech/3' }, priority: 90 }
          ]
        }
      };

      manager._adjustSimilarSteps(execution, 0, 20, 'boost');

      // Step 1 already completed (currentStep is past it), should not adjust
      expect(execution.plan.steps[1].priority).toBe(80);
      // Step 2 not completed (currentStep includes it), should adjust
      expect(execution.plan.steps[2].priority).toBe(110);
    });

    test('logs adjustments', () => {
      const execution = {
        currentStep: 1,
        plan: {
          steps: [
            { idx: 0, action: { type: 'explore', url: 'https://example.com/news/tech/1' }, priority: 100 },
            { idx: 1, action: { type: 'explore', url: 'https://example.com/news/tech/2' }, priority: 80 }
          ]
        }
      };

      manager._adjustSimilarSteps(execution, 0, 20, 'boost');

      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[Real-Time Adjustment] boost 1 steps similar to step 1')
      );
    });
  });

  describe('recordPlanStep integration', () => {
    beforeEach(() => {
      // Note: startPlanExecution takes (jobId, plan), not (jobId, sessionId, plan)
      const jobId = 1; // Use fixed ID for simplicity
      
      manager.startPlanExecution(jobId, {
        steps: [
          { idx: 0, action: { type: 'explore', url: 'https://example.com/news/tech/article1' }, expectedValue: 50, priority: 100 },
          { idx: 1, action: { type: 'explore', url: 'https://example.com/news/tech/article2' }, expectedValue: 50, priority: 80 },
          { idx: 2, action: { type: 'explore', url: 'https://example.com/news/tech/article3' }, expectedValue: 50, priority: 90 },
          { idx: 3, action: { type: 'collect', url: 'https://example.com/article/123' }, expectedValue: 10, priority: 70 }
        ]
      });
    });

    test('boosts similar steps on excellent performance', () => {
      const jobId = 1;
      const execution = manager.planExecutions.get(jobId);

      // Record excellent performance (>150% of expected)
      manager.recordPlanStep(jobId, 0, { value: 100, expectedValue: 50 }); // 200%

      // Check that similar steps were boosted (same pattern: /news/tech/)
      expect(execution.plan.steps[1].priority).toBe(100); // 80 + 20
      expect(execution.plan.steps[2].priority).toBe(110); // 90 + 20
      expect(execution.plan.steps[3].priority).toBe(70); // Different action, not adjusted
    });

    test('penalizes similar steps on poor performance', () => {
      const jobId = 1;
      manager.recordPlanStep(jobId, 0, { value: 20, expectedValue: 50 }); // 40%

      const execution = manager.planExecutions.get(jobId);
      expect(execution.plan.steps[1].priority).toBe(65); // 80 - 15
      expect(execution.plan.steps[2].priority).toBe(75); // 90 - 15
      expect(execution.plan.steps[3].priority).toBe(70); // Different action, not adjusted
    });

    test('no adjustment for medium performance', () => {
      const jobId = 1;
      manager.recordPlanStep(jobId, 0, { value: 50, expectedValue: 50 }); // 100%

      const execution = manager.planExecutions.get(jobId);
      expect(execution.plan.steps[1].priority).toBe(80); // No change
      expect(execution.plan.steps[2].priority).toBe(90); // No change
    });

    test('handles steps without expectedValue', () => {
      const jobId = 2;
      manager.startPlanExecution(jobId, {
        steps: [
          { idx: 0, action: { type: 'explore', url: 'https://test.com/news' }, priority: 100 }, // No expectedValue
          { idx: 1, action: { type: 'explore', url: 'https://test.com/sports' }, priority: 80 }
        ]
      });

      // Should not crash (performanceRatio will be 1.0, no adjustment)
      expect(() => {
        manager.recordPlanStep(jobId, 0, { value: 100 });
      }).not.toThrow();

      const execution = manager.planExecutions.get(jobId);
      expect(execution.plan.steps[1].priority).toBe(80); // No adjustment (expectedValue missing → ratio 1.0)
    });

    test('respects feature flag', () => {
      // Create manager with feature disabled
      const managerNoAdjust = new IntelligentCrawlerManager({
        logger: mockLogger,
        features: { realTimePlanAdjustment: false }
      });

      const jobId = 3;
      managerNoAdjust.startPlanExecution(jobId, {
        steps: [
          { idx: 0, action: { type: 'explore', url: 'https://test2.com/news/tech/1' }, expectedValue: 50, priority: 100 },
          { idx: 1, action: { type: 'explore', url: 'https://test2.com/news/tech/2' }, expectedValue: 50, priority: 80 }
        ]
      });

      managerNoAdjust.recordPlanStep(jobId, 0, { value: 100, expectedValue: 50 }); // Excellent performance

      const execution = managerNoAdjust.planExecutions.get(jobId);
      expect(execution.plan.steps[1].priority).toBe(80); // No adjustment (feature disabled)

      // Should NOT log adjustment
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[Real-Time Adjustment]')
      );
    });
  });
});
