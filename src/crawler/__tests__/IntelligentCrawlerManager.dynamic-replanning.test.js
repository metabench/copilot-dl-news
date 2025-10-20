/**
 * Phase 3 Dynamic Re-Planning Tests
 * Tests for _shouldReplan, _calculateAvgPerformance, _triggerReplan, _mergePlans
 */

const { IntelligentCrawlerManager } = require('../../deprecated-ui/express/services/IntelligentCrawlerManager');
const Database = require('better-sqlite3');

describe('IntelligentCrawlerManager - Dynamic Re-Planning (Phase 3)', () => {
  let db;
  let manager;
  let logger;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS crawl_jobs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT UNIQUE NOT NULL,
        domain TEXT,
        status TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS queue_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        event_type TEXT,
        details TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS planning_sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        job_id TEXT,
        domain TEXT,
        plan TEXT,
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS hierarchical_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT,
        plan_steps TEXT,
        estimated_value REAL,
        probability REAL,
        created_at TEXT NOT NULL
      );
    `);

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    manager = new IntelligentCrawlerManager({
      db,
      logger,
      features: {
        dynamicReplanning: true
      }
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('_shouldReplan', () => {
    test('should trigger on periodic interval (every 100 requests)', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 100,
        stepResults: [],
        lastReplanAt: null,
        replanCount: 0
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should trigger at 200, 300, 400 requests', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        stepResults: [],
        lastReplanAt: null,
        replanCount: 0
      };

      exec.requestsProcessed = 200;
      expect(manager._shouldReplan(exec)).toBe(true);

      exec.requestsProcessed = 300;
      expect(manager._shouldReplan(exec)).toBe(true);

      exec.requestsProcessed = 400;
      expect(manager._shouldReplan(exec)).toBe(true);
    });

    test('should not trigger between periodic intervals', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 150,
        stepResults: [],
        lastReplanAt: null,
        replanCount: 0
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(false);
    });

    test('should trigger on performance deviation >40%', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [
          { result: { value: 50, expectedValue: 100 } }, // 50% performance
          { result: { value: 30, expectedValue: 100 } }  // 30% performance
        ],
        lastReplanAt: null,
        replanCount: 0
      };

      // Average performance = (0.5 + 0.3) / 2 = 0.4 (60% deviation from 1.0)
      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should trigger on performance deviation >40% (high performance)', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [
          { result: { value: 150, expectedValue: 100 } }, // 150% performance
          { result: { value: 140, expectedValue: 100 } }  // 140% performance
        ],
        lastReplanAt: null,
        replanCount: 0
      };

      // Average performance = (1.5 + 1.4) / 2 = 1.45 (45% deviation from 1.0)
      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should not trigger on acceptable performance deviation', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [
          { result: { value: 90, expectedValue: 100 } }, // 90% performance
          { result: { value: 110, expectedValue: 100 } } // 110% performance
        ],
        lastReplanAt: null,
        replanCount: 0
      };

      // Average performance = (0.9 + 1.1) / 2 = 1.0 (0% deviation)
      const should = manager._shouldReplan(exec);
      expect(should).toBe(false);
    });

    test('should trigger on excessive backtracks (>5)', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [],
        backtracks: 6,
        lastReplanAt: null,
        replanCount: 0
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should not trigger on acceptable backtrack count', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [],
        backtracks: 3,
        lastReplanAt: null,
        replanCount: 0
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(false);
    });

    test('should respect minimum 60s between replans', () => {
      const now = Date.now();
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 100, // Periodic trigger
        stepResults: [],
        lastReplanAt: now - 30000, // 30s ago
        replanCount: 1
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(false);
    });

    test('should allow replan after 60s has passed', () => {
      const now = Date.now();
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 100, // Periodic trigger
        stepResults: [],
        lastReplanAt: now - 70000, // 70s ago
        replanCount: 1
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should handle first replan (lastReplanAt is null)', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 100,
        stepResults: [],
        lastReplanAt: null,
        replanCount: 0
      };

      const should = manager._shouldReplan(exec);
      expect(should).toBe(true);
    });

    test('should handle empty stepResults for performance check', () => {
      const exec = {
        plan: { steps: [{ action: 'step1' }] },
        requestsProcessed: 50,
        stepResults: [],
        backtracks: 2,
        lastReplanAt: null,
        replanCount: 0
      };

      // Should not crash, should return false (no trigger)
      const should = manager._shouldReplan(exec);
      expect(should).toBe(false);
    });
  });

  describe('_calculateAvgPerformance', () => {
    test('should calculate average performance ratio', () => {
      const exec = {
        stepResults: [
          { result: { value: 50, expectedValue: 100 } },  // 0.5
          { result: { value: 80, expectedValue: 100 } },  // 0.8
          { result: { value: 120, expectedValue: 100 } }  // 1.2
        ]
      };

      const avg = manager._calculateAvgPerformance(exec);
      // (0.5 + 0.8 + 1.2) / 3 = 0.8333...
      expect(avg).toBeCloseTo(0.833, 2);
    });

    test('should handle perfect performance', () => {
      const exec = {
        stepResults: [
          { result: { value: 100, expectedValue: 100 } },
          { result: { value: 100, expectedValue: 100 } },
          { result: { value: 100, expectedValue: 100 } }
        ]
      };

      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(1.0);
    });

    test('should handle poor performance', () => {
      const exec = {
        stepResults: [
          { result: { value: 20, expectedValue: 100 } },  // 0.2
          { result: { value: 30, expectedValue: 100 } }   // 0.3
        ]
      };

      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(0.25);
    });

    test('should handle high performance', () => {
      const exec = {
        stepResults: [
          { result: { value: 200, expectedValue: 100 } },  // 2.0
          { result: { value: 150, expectedValue: 100 } }   // 1.5
        ]
      };

      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(1.75);
    });

    test('should return null for empty stepResults', () => {
      const exec = {
        stepResults: []
      };

      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(null);
    });

    test('should handle zero expectedValue gracefully', () => {
      const exec = {
        stepResults: [
          { result: { value: 50, expectedValue: 0 } }
        ]
      };

      // Should not divide by zero, should return null
      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(null);
    });

    test('should handle single result', () => {
      const exec = {
        stepResults: [
          { result: { value: 75, expectedValue: 100 } }
        ]
      };

      const avg = manager._calculateAvgPerformance(exec);
      expect(avg).toBe(0.75);
    });
  });

  describe('_mergePlans', () => {
    test('should keep completed steps and replace remaining', () => {
      const oldPlan = {
        domain: 'example.com',
        steps: [
          { action: 'step1', status: 'completed' },
          { action: 'step2', status: 'completed' },
          { action: 'step3', status: 'pending' },
          { action: 'step4', status: 'pending' }
        ],
        totalValue: 400,
        probability: 0.7
      };

      const newPlan = {
        domain: 'example.com',
        steps: [
          { action: 'newStep1', status: 'pending' },
          { action: 'newStep2', status: 'pending' },
          { action: 'newStep3', status: 'pending' }
        ],
        totalValue: 350,
        probability: 0.75
      };

      const currentStep = 2; // Completed steps 0 and 1

      const merged = manager._mergePlans(oldPlan, newPlan, currentStep);

      expect(merged.domain).toBe('example.com');
      expect(merged.steps).toHaveLength(5);
      
      // First 2 steps from old plan
      expect(merged.steps[0].action).toBe('step1');
      expect(merged.steps[1].action).toBe('step2');
      
      // Remaining from new plan
      expect(merged.steps[2].action).toBe('newStep1');
      expect(merged.steps[3].action).toBe('newStep2');
      expect(merged.steps[4].action).toBe('newStep3');
      
      expect(merged.recomputed).toBe(true);
    });

    test('should replace all steps if no steps completed', () => {
      const oldPlan = {
        domain: 'example.com',
        steps: [
          { action: 'step1', status: 'pending' },
          { action: 'step2', status: 'pending' }
        ],
        totalValue: 200,
        probability: 0.7
      };

      const newPlan = {
        domain: 'example.com',
        steps: [
          { action: 'newStep1', status: 'pending' },
          { action: 'newStep2', status: 'pending' }
        ],
        totalValue: 250,
        probability: 0.8
      };

      const currentStep = 0;

      const merged = manager._mergePlans(oldPlan, newPlan, currentStep);

      expect(merged.steps).toHaveLength(2);
      expect(merged.steps[0].action).toBe('newStep1');
      expect(merged.steps[1].action).toBe('newStep2');
    });

    test('should handle completed plan (all steps done)', () => {
      const oldPlan = {
        domain: 'example.com',
        steps: [
          { action: 'step1', status: 'completed' },
          { action: 'step2', status: 'completed' }
        ],
        totalValue: 200,
        probability: 0.7
      };

      const newPlan = {
        domain: 'example.com',
        steps: [
          { action: 'newStep1', status: 'pending' }
        ],
        totalValue: 100,
        probability: 0.8
      };

      const currentStep = 2; // All completed

      const merged = manager._mergePlans(oldPlan, newPlan, currentStep);

      expect(merged.steps).toHaveLength(3);
      expect(merged.steps[0].action).toBe('step1');
      expect(merged.steps[1].action).toBe('step2');
      expect(merged.steps[2].action).toBe('newStep1');
    });

    test('should preserve old plan metadata', () => {
      const oldPlan = {
        domain: 'example.com',
        steps: [{ action: 'step1' }],
        totalValue: 100,
        probability: 0.7,
        metadata: { custom: 'data' }
      };

      const newPlan = {
        domain: 'example.com',
        steps: [{ action: 'newStep1' }],
        totalValue: 150,
        probability: 0.8
      };

      const merged = manager._mergePlans(oldPlan, newPlan, 1);

      expect(merged.domain).toBe('example.com');
      expect(merged.totalValue).toBe(100);
      expect(merged.probability).toBe(0.7);
      expect(merged.metadata).toEqual({ custom: 'data' });
    });
  });

  describe('_triggerReplan (integration)', () => {
    test('should emit milestone event on replan trigger', async () => {
      const jobId = 'test-job-123';
      const exec = {
        plan: {
          domain: 'example.com',
          steps: [
            { action: 'step1', status: 'completed' },
            { action: 'step2', status: 'pending' }
          ]
        },
        currentStep: 1,
        requestsProcessed: 100,
        replanCount: 0
      };

      // Register execution
      manager.planExecutions.set(jobId, exec);

      await manager._triggerReplan(jobId, exec);

      expect(exec.replanCount).toBe(1);
      expect(exec.lastReplanAt).toBeDefined();
      expect(exec.lastReplanAt).toBeGreaterThan(Date.now() - 1000);
    });

    test('should handle missing hierarchicalPlanner gracefully', async () => {
      const jobId = 'test-job-123';
      const exec = {
        plan: {
          domain: 'example.com',
          steps: [{ action: 'step1' }]
        },
        currentStep: 0,
        replanCount: 0
      };

      manager.planExecutions.set(jobId, exec);

      // Should not throw
      await manager._triggerReplan(jobId, exec);

      expect(exec.replanCount).toBe(1);
    });
  });

  describe('feature flag integration', () => {
    test('should respect dynamicReplanning feature flag', () => {
      const managerDisabled = new IntelligentCrawlerManager({
        db,
        logger,
        features: {
          dynamicReplanning: false
        }
      });

      const exec = {
        requestsProcessed: 100,
        stepResults: [],
        lastReplanAt: null,
        replanCount: 0
      };

      // Should return false even though periodic trigger met
      const should = managerDisabled._shouldReplan(exec);
      expect(should).toBe(false);
    });
  });

  describe('recordPlanStep integration', () => {
    test('should track requests and results', () => {
      const jobId = 'test-job-123';
      const exec = {
        plan: {
          steps: [{ action: 'step1' }]
        },
        currentStep: 0,
        stepResults: [],
        requestsProcessed: 0,
        actualArticlesCollected: 0,
        actualHubsDiscovered: 0
      };

      manager.planExecutions.set(jobId, exec);

      const result = {
        value: 50,
        expectedValue: 100,
        articlesFound: 15,
        hubsFound: 3
      };

      manager.recordPlanStep(jobId, 0, result);

      expect(exec.requestsProcessed).toBe(1);
      expect(exec.actualArticlesCollected).toBe(15);
      expect(exec.actualHubsDiscovered).toBe(3);
      expect(exec.stepResults).toHaveLength(1);
      expect(exec.stepResults[0].result).toEqual(result);
    });
  });
});
