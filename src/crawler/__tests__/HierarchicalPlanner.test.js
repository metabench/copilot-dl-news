/**
 * Tests for HierarchicalPlanner - Strategic multi-step planning
 */

const { HierarchicalPlanner } = require('../HierarchicalPlanner');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('HierarchicalPlanner', () => {
  let db;
  let planner;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    tempDbPath = path.join(__dirname, `test-planner-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS hierarchical_plans (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        plan_steps TEXT NOT NULL,
        estimated_value REAL,
        probability REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS planning_heuristics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL UNIQUE,
        patterns TEXT NOT NULL,
        avg_lookahead REAL,
        branching_factor REAL,
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    
    mockLogger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };
    
    planner = new HierarchicalPlanner({ db, logger: mockLogger, maxLookahead: 3, maxBranches: 5 });
  });

  afterEach(() => {
    if (planner) {
      planner.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('generatePlan', () => {
    test('generates multi-step plan', async () => {
      const initialState = {
        hubsDiscovered: 0,
        articlesCollected: 0,
        requestsMade: 0
      };

      const goal = {
        hubsTarget: 10,
        articlesTarget: 500
      };

      const candidates = [
        { url: '/hub1', estimatedArticles: 50, estimatedRequests: 5, confidence: 0.8 },
        { url: '/hub2', estimatedArticles: 100, estimatedRequests: 10, confidence: 0.7 }
      ];

      const plan = await planner.generatePlan(initialState, goal, {
        domain: 'example.com',
        candidates,
        lookahead: 3
      });

      expect(plan).toBeDefined();
      if (plan) {
        expect(plan.steps).toBeDefined();
        expect(plan.totalValue).toBeGreaterThan(0);
        expect(plan.probability).toBeGreaterThan(0);
      }
    });

    test('respects lookahead depth limit', async () => {
      const initialState = { hubsDiscovered: 0 };
      const goal = { hubsTarget: 100 };
      const candidates = [
        { url: '/hub1', estimatedArticles: 50, estimatedRequests: 5, confidence: 0.8 }
      ];

      const plan = await planner.generatePlan(initialState, goal, {
        candidates,
        lookahead: 2
      });

      if (plan) {
        expect(plan.length).toBeLessThanOrEqual(2);
      }
    });

    test('limits branching factor', async () => {
      const initialState = { hubsDiscovered: 0 };
      const goal = { hubsTarget: 10 };
      const candidates = Array.from({ length: 20 }, (_, i) => ({
        url: `/hub${i}`,
        estimatedArticles: 50,
        estimatedRequests: 5,
        confidence: 0.7
      }));

      const plan = await planner.generatePlan(initialState, goal, {
        candidates,
        maxBranches: 3
      });

      // Should not explore all 20 candidates
      expect(mockLogger.log).toHaveBeenCalled();
    });
  });

  describe('simulateSequence', () => {
    test('simulates action sequence and predicts outcomes', async () => {
      const actions = [
        { url: '/hub1', estimatedArticles: 50, estimatedRequests: 5, confidence: 0.8 },
        { url: '/hub2', estimatedArticles: 100, estimatedRequests: 10, confidence: 0.7 },
        { url: '/hub3', estimatedArticles: 75, estimatedRequests: 8, confidence: 0.9 }
      ];

      const initialState = {
        hubsDiscovered: 0,
        articlesCollected: 0,
        requestsMade: 0
      };

      const result = await planner.simulateSequence(actions, initialState);

      expect(result.steps).toHaveLength(3);
      expect(result.finalState.hubsDiscovered).toBe(3);
      expect(result.totalValue).toBeGreaterThan(0);
      expect(result.totalCost).toBeGreaterThan(0);
      expect(result.feasible).toBeDefined();
    });

    test('stops simulation on low confidence', async () => {
      const actions = [
        { url: '/hub1', estimatedArticles: 50, estimatedRequests: 5, confidence: 0.8 },
        { url: '/hub2', estimatedArticles: 100, estimatedRequests: 10, confidence: 0.2 }, // Low confidence
        { url: '/hub3', estimatedArticles: 75, estimatedRequests: 8, confidence: 0.9 }
      ];

      const initialState = { hubsDiscovered: 0 };

      const result = await planner.simulateSequence(actions, initialState);

      // Should stop after hub2 due to low confidence
      expect(result.steps.length).toBeLessThan(3);
    });

    test('marks infeasible plans (low ROI)', async () => {
      const actions = [
        { url: '/hub1', estimatedArticles: 10, estimatedRequests: 100, confidence: 0.8 } // Poor ROI
      ];

      const initialState = { hubsDiscovered: 0 };

      const result = await planner.simulateSequence(actions, initialState);

      expect(result.feasible).toBe(false);
    });
  });

  describe('executePlan', () => {
    test('executes plan steps sequentially', async () => {
      const plan = {
        steps: [
          { action: { url: '/hub1' }, expectedValue: 50 },
          { action: { url: '/hub2' }, expectedValue: 100 },
          { action: { url: '/hub3' }, expectedValue: 75 }
        ]
      };

      const executedSteps = [];
      const onStep = async (action, step) => {
        executedSteps.push(action.url);
        return { success: true, value: 60 };
      };

      const result = await planner.executePlan(plan, { onStep });

      expect(result.completed).toBe(true);
      expect(executedSteps).toEqual(['/hub1', '/hub2', '/hub3']);
    });

    test('backtracks on underperforming steps', async () => {
      const plan = {
        steps: [
          { action: { url: '/hub1' }, expectedValue: 50 },
          { action: { url: '/hub2' }, expectedValue: 100 },
          { action: { url: '/hub3' }, expectedValue: 75 }
        ]
      };

      let stepCount = 0;
      const onStep = async (action, step) => {
        stepCount++;
        // Make step 1 underperform
        if (step === 1) {
          return { success: true, value: 20 }; // Much less than expected 100
        }
        return { success: true, value: 60 };
      };

      const backtracks = [];
      const onBacktrack = async (step, count) => {
        backtracks.push({ step, count });
      };

      const result = await planner.executePlan(plan, { onStep, onBacktrack, maxBacktracks: 2 });

      expect(backtracks.length).toBeGreaterThan(0);
      expect(stepCount).toBeGreaterThan(3); // Re-executed steps due to backtracking
    });

    test('aborts after max backtracks', async () => {
      const plan = {
        steps: [
          { action: { url: '/hub1' }, expectedValue: 50 },
          { action: { url: '/hub2' }, expectedValue: 100 }
        ]
      };

      const onStep = async () => {
        return { success: true, value: 1 }; // Always underperform
      };

      const result = await planner.executePlan(plan, { onStep, maxBacktracks: 2 });

      expect(result.completed).toBe(false);
      expect(result.backtracks).toBe(2);
    });
  });

  describe('learnHeuristics', () => {
    test('learns patterns from successful outcomes', async () => {
      const planOutcomes = [
        {
          success: true,
          actualValue: 150,
          estimatedValue: 100,
          planLength: 3,
          branchingFactor: 2,
          actionSequence: [
            { type: 'country-hub' },
            { type: 'region-hub' },
            { type: 'city-hub' }
          ]
        },
        {
          success: true,
          actualValue: 200,
          estimatedValue: 150,
          planLength: 2,
          branchingFactor: 3,
          actionSequence: [
            { type: 'country-hub' },
            { type: 'region-hub' }
          ]
        }
      ];

      const heuristic = await planner.learnHeuristics('example.com', planOutcomes);

      expect(heuristic).toBeDefined();
      expect(heuristic.domain).toBe('example.com');
      expect(heuristic.patterns).toBeDefined();
      expect(heuristic.avgLookahead).toBeCloseTo(2.5, 1);
      expect(heuristic.branchingFactor).toBeCloseTo(2.5, 1);
    });

    test('requires minimum data for learning', async () => {
      const heuristic = await planner.learnHeuristics('example.com', []);
      expect(heuristic).toBeNull();
    });

    test('caches learned heuristics', async () => {
      const planOutcomes = [
        {
          success: true,
          actualValue: 150,
          estimatedValue: 100,
          actionSequence: [{ type: 'country-hub' }]
        }
      ];

      await planner.learnHeuristics('example.com', planOutcomes);

      expect(planner.heuristics.has('example.com')).toBe(true);
    });
  });

  describe('getStats', () => {
    test('returns planning statistics', () => {
      const stats = planner.getStats();

      expect(stats.activePlans).toBeDefined();
      expect(stats.completedPlans).toBeDefined();
      expect(stats.heuristicsLearned).toBeDefined();
      expect(stats.maxLookahead).toBe(3);
      expect(stats.maxBranches).toBe(5);
    });
  });

  describe('close', () => {
    test('clears all state', () => {
      planner.activePlans = [{}];
      planner.completedPlans = [{}];
      planner.heuristics.set('domain', {});

      planner.close();

      expect(planner.activePlans).toEqual([]);
      expect(planner.completedPlans).toEqual([]);
      expect(planner.heuristics.size).toBe(0);
    });
  });
});
