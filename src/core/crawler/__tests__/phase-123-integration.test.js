/**
 * Integration tests for Phase 1-3 features
 * Tests that all components are properly wired together
 */

const Database = require('better-sqlite3');
const path = require('path');
const os = require('os');
const fs = require('fs');

const { HierarchicalPlanner } = require('../HierarchicalPlanner');
const { IntelligentCrawlerManager } = require('../../../deprecated-ui/express/services/IntelligentCrawlerManager');

describe('Phase 1-3 Integration Tests', () => {
  let tempDir;
  let dbPath;
  let db;
  let planner;
  let manager;

  beforeEach(() => {
    // Create temp database
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'phase-integration-'));
    dbPath = path.join(tempDir, 'test.db');
    db = new Database(dbPath);

    // Create required tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        domain TEXT,
        title TEXT,
        content TEXT,
        discovered_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS planning_heuristics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        patterns TEXT,
        confidence REAL DEFAULT 0.8,
        sample_size INTEGER DEFAULT 0,
        avg_lookahead REAL,
        branching_factor REAL,
        updated_at TEXT
      );

      CREATE TABLE IF NOT EXISTS pattern_performance (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        heuristic_id INTEGER NOT NULL REFERENCES planning_heuristics(id) ON DELETE CASCADE,
        pattern_signature TEXT NOT NULL,
        success_count INTEGER DEFAULT 0,
        failure_count INTEGER DEFAULT 0,
        total_value REAL DEFAULT 0,
        avg_value REAL DEFAULT 0,
        last_seen TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_pattern_performance_heuristic ON pattern_performance(heuristic_id);
    `);

    // Seed test data for adaptive branching
    const stmt = db.prepare('INSERT INTO articles (url, domain, title, discovered_at) VALUES (?, ?, ?, ?)');
    for (let i = 0; i < 150; i++) {
      stmt.run(
        `https://example.com/article-${i}`,
        'example.com',
        `Article ${i}`,
        Date.now() - i * 1000
      );
    }

    // Seed planning heuristics first (parent table)
    const heuristicId = db.prepare(`
      INSERT INTO planning_heuristics (domain, patterns, confidence, sample_size, avg_lookahead, branching_factor, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
    `).run('example.com', JSON.stringify([
      { pattern: '/news/', avgValue: 45.5, confidence: 0.8 },
      { pattern: '/category/', avgValue: 38.2, confidence: 0.7 },
      { pattern: '/section/', avgValue: 52.1, confidence: 0.85 }
    ]), 0.8, 18, 5, 10).lastInsertRowid;

    // Seed pattern performance data with FK to planning_heuristics
    const patternStmt = db.prepare(`
      INSERT INTO pattern_performance (heuristic_id, pattern_signature, success_count, failure_count, avg_value, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `);
    patternStmt.run(heuristicId, 'explore:/news/', 10, 2, 45.5);
    patternStmt.run(heuristicId, 'explore:/category/', 8, 1, 38.2);
    patternStmt.run(heuristicId, 'explore:/section/', 5, 0, 52.1);

    // Initialize planner with all features enabled
    planner = new HierarchicalPlanner({
      db,
      logger: { log: () => {}, warn: () => {}, error: console.error },
      maxLookahead: 7,
      maxBranches: 15,
      features: {
        // Phase 1
        costAwarePriority: true,
        patternDiscovery: true,
        // Phase 2
        adaptiveBranching: true,
        realTimePlanAdjustment: true,
        // Phase 3
        dynamicReplanning: true,
        crossDomainSharing: true
      }
    });

    // Initialize manager with planner reference
    manager = new IntelligentCrawlerManager({
      logger: { log: () => {}, warn: () => {}, error: console.error },
      features: {
        realTimePlanAdjustment: true,
        dynamicReplanning: true
      },
      hierarchicalPlanner: planner
    });
  });

  afterEach(() => {
    if (db) {
      try {
        db.close();
      } catch (err) {
        // Ignore close errors
      }
    }
    if (tempDir && fs.existsSync(tempDir)) {
      fs.rmSync(tempDir, { recursive: true, force: true });
    }
  });

  describe('End-to-End Feature Integration', () => {
    test('planner should use adaptive branching based on domain profile', async () => {
      const initialState = {
        hubsDiscovered: 0,
        articlesCollected: 0,
        requestsMade: 0,
        momentum: 0
      };

      const goal = {
        hubsTarget: 50,
        articlesTarget: 500,
        coverageTarget: 0.85
      };

      const candidates = [
        { type: 'explore-hub', url: 'https://example.com/news/', estimatedArticles: 50, estimatedRequests: 10, confidence: 0.8 },
        { type: 'explore-hub', url: 'https://example.com/category/', estimatedArticles: 40, estimatedRequests: 8, confidence: 0.7 }
      ];

      const plan = await planner.generatePlan(initialState, goal, {
        domain: 'example.com',
        candidates,
        lookahead: 5
      });

      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
      expect(plan.steps.length).toBeGreaterThan(0);
      
      // Verify adaptive branching affected the plan
      // With 150+ articles, should use maxLookahead=7, maxBranches=15
      expect(plan.steps.length).toBeGreaterThanOrEqual(3);
    });

    test('planner should discover patterns from database', async () => {
      const initialState = {
        hubsDiscovered: 0,
        articlesCollected: 0,
        requestsMade: 0,
        momentum: 0
      };

      const goal = {
        hubsTarget: 30,
        articlesTarget: 300,
        coverageTarget: 0.8
      };

      // Don't provide candidates - should discover from patterns
      const plan = await planner.generatePlan(initialState, goal, {
        domain: 'example.com',
        candidates: [],
        lookahead: 5
      });

      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
      
      // Should have generated candidates from pattern performance data
      // Patterns: /news/, /category/, /section/ all have success_count >= 5
      expect(plan.steps.length).toBeGreaterThan(0);
    });

    test('manager should trigger replan when performance deviates', async () => {
      const jobId = 'test-job-123';
      const plan = {
        domain: 'example.com',
        goal: { hubsTarget: 50, articlesTarget: 500, coverageTarget: 0.85 },
        candidates: [],
        steps: [
          { action: { type: 'explore', url: 'https://example.com/hub1' }, expectedValue: 100, cost: 10 },
          { action: { type: 'explore', url: 'https://example.com/hub2' }, expectedValue: 100, cost: 10 },
          { action: { type: 'explore', url: 'https://example.com/hub3' }, expectedValue: 100, cost: 10 }
        ]
      };

      manager.startPlanExecution(jobId, plan);

      const exec = manager.planExecutions.get(jobId);
      expect(exec).toBeDefined();
      expect(exec.replanCount).toBe(0);

      // Record steps with poor performance (40% below expected)
      await manager.recordPlanStep(jobId, 0, { value: 40, expectedValue: 100, articlesFound: 40, hubsFound: 1 });
      await manager.recordPlanStep(jobId, 1, { value: 50, expectedValue: 100, articlesFound: 50, hubsFound: 2 });

      // Should have triggered replan due to performance deviation
      // Average performance: (40/100 + 50/100) / 2 = 0.45 (45%)
      // Deviation from 100%: |0.45 - 1.0| = 0.55 > 0.4 threshold
      expect(exec.replanCount).toBeGreaterThan(0);
      expect(exec.lastReplanAt).toBeDefined();
    });

    test('manager should trigger replan after 100 requests', async () => {
      const jobId = 'test-job-456';
      const plan = {
        domain: 'example.com',
        goal: { hubsTarget: 50, articlesTarget: 500, coverageTarget: 0.85 },
        candidates: [],
        steps: Array.from({ length: 20 }, (_, i) => ({
          action: { type: 'explore', url: `https://example.com/hub${i}` },
          expectedValue: 100,
          cost: 10
        }))
      };

      manager.startPlanExecution(jobId, plan);

      const exec = manager.planExecutions.get(jobId);
      
      // Simulate 100 requests with decent performance
      for (let i = 0; i < 100; i++) {
        await manager.recordPlanStep(jobId, i % plan.steps.length, {
          value: 90,
          expectedValue: 100,
          articlesFound: 90,
          hubsFound: 1
        });
      }

      // Should have triggered periodic replan at 100 requests
      expect(exec.replanCount).toBeGreaterThan(0);
      expect(exec.requestsProcessed).toBe(100);
    });

    test('cross-domain sharing should transfer patterns to similar domains', async () => {
      // Create heuristic for source domain
      const sourceHeuristic = {
        patterns: [
          { pattern: '/news/', avgValue: 45.5, confidence: 0.8 },
          { pattern: '/category/', avgValue: 38.2, confidence: 0.7 }
        ],
        avgLookahead: 5,
        branchingFactor: 10
      };

      const planOutcomes = [
        {
          state: { hubsDiscovered: 10, articlesCollected: 450 },
          action: { type: 'explore-hub', url: 'https://source.com/news/tech' },
          value: 45,
          expectedValue: 50
        }
      ];

      // Seed similar domain articles
      const stmt = db.prepare('INSERT INTO articles (url, domain, title, discovered_at) VALUES (?, ?, ?, ?)');
      for (let i = 0; i < 10; i++) {
        stmt.run(
          `https://target.com/news/${i}`,
          'target.com',
          `Target Article ${i}`,
          Date.now() - i * 1000
        );
      }

      // Learn heuristics and trigger cross-domain sharing
      await planner.learnHeuristics('source.com', planOutcomes);

      // Check if patterns were shared to target.com
      const shared = db.prepare(`
        SELECT * FROM planning_heuristics
        WHERE domain = 'target.com'
      `).get();

      expect(shared).toBeDefined();
      expect(shared.patterns).toBeDefined();
      
      const patterns = JSON.parse(shared.patterns);
      expect(patterns.length).toBeGreaterThan(0);
      
      // Confidence should be reduced by 70% (0.8 * 0.7 = 0.56)
      expect(shared.confidence).toBeCloseTo(0.56, 2);
    });
  });

  describe('Feature Flag Propagation', () => {
    test('planner should respect disabled features', async () => {
      const plannerDisabled = new HierarchicalPlanner({
        db,
        logger: { log: () => {}, warn: () => {}, error: console.error },
        features: {
          costAwarePriority: false,
          patternDiscovery: false,
          adaptiveBranching: false,
          realTimePlanAdjustment: false,
          dynamicReplanning: false,
          crossDomainSharing: false
        }
      });

      const initialState = { hubsDiscovered: 0, articlesCollected: 0, requestsMade: 0, momentum: 0 };
      const goal = { hubsTarget: 30, articlesTarget: 300, coverageTarget: 0.8 };

      const plan = await plannerDisabled.generatePlan(initialState, goal, {
        domain: 'example.com',
        candidates: [
          { type: 'explore-hub', url: 'https://example.com/hub', estimatedArticles: 50, estimatedRequests: 10, confidence: 0.8 }
        ],
        lookahead: 5
      });

      // Should still generate plan, but without enhanced features
      expect(plan).toBeDefined();
      expect(plan.steps).toBeDefined();
    });

    test('manager should not trigger replan when feature disabled', async () => {
      const managerDisabled = new IntelligentCrawlerManager({
        logger: { log: () => {}, warn: () => {}, error: console.error },
        features: {
          realTimePlanAdjustment: false,
          dynamicReplanning: false
        }
      });

      const jobId = 'test-job-disabled';
      const plan = {
        domain: 'example.com',
        goal: { hubsTarget: 50, articlesTarget: 500, coverageTarget: 0.85 },
        candidates: [],
        steps: [
          { action: { type: 'explore', url: 'https://example.com/hub1' }, expectedValue: 100, cost: 10 }
        ]
      };

      managerDisabled.startPlanExecution(jobId, plan);

      // Record poor performance - should NOT trigger replan
      await managerDisabled.recordPlanStep(jobId, 0, { value: 20, expectedValue: 100, articlesFound: 20, hubsFound: 1 });

      const exec = managerDisabled.planExecutions.get(jobId);
      expect(exec.replanCount).toBe(0); // No replan because feature disabled
    });
  });

  describe('Planner-Manager Integration', () => {
    test('manager with planner reference can generate real plans during replan', async () => {
      const jobId = 'test-real-replan';
      const plan = {
        domain: 'example.com',
        goal: { hubsTarget: 50, articlesTarget: 500, coverageTarget: 0.85 },
        candidates: [
          { type: 'explore-hub', url: 'https://example.com/hub1', estimatedArticles: 50, estimatedRequests: 10, confidence: 0.8 }
        ],
        steps: [
          { action: { type: 'explore', url: 'https://example.com/hub1' }, expectedValue: 100, cost: 10 },
          { action: { type: 'explore', url: 'https://example.com/hub2' }, expectedValue: 100, cost: 10 }
        ]
      };

      manager.startPlanExecution(jobId, plan);

      // Trigger replan via poor performance
      await manager.recordPlanStep(jobId, 0, { value: 30, expectedValue: 100, articlesFound: 30, hubsFound: 1 });
      await manager.recordPlanStep(jobId, 1, { value: 40, expectedValue: 100, articlesFound: 40, hubsFound: 2 });

      const exec = manager.planExecutions.get(jobId);
      
      // Should have called hierarchicalPlanner.generatePlan()
      expect(exec.replanCount).toBeGreaterThan(0);
      expect(exec.plan.steps).toBeDefined();
      
      // Plan should have been merged (kept completed steps)
      expect(exec.plan.recomputed).toBe(true);
    });

    test('manager without planner reference falls back to mock replan', async () => {
      const managerNoPlan = new IntelligentCrawlerManager({
        logger: { log: () => {}, warn: () => {}, error: console.error },
        features: {
          dynamicReplanning: true
        }
        // No hierarchicalPlanner reference
      });

      const jobId = 'test-mock-replan';
      const plan = {
        domain: 'example.com',
        goal: { hubsTarget: 50, articlesTarget: 500, coverageTarget: 0.85 },
        candidates: [],
        steps: [
          { action: { type: 'explore', url: 'https://example.com/hub1' }, expectedValue: 100, cost: 10 }
        ]
      };

      managerNoPlan.startPlanExecution(jobId, plan);

      // Trigger replan
      await managerNoPlan.recordPlanStep(jobId, 0, { value: 30, expectedValue: 100, articlesFound: 30, hubsFound: 1 });

      const exec = managerNoPlan.planExecutions.get(jobId);
      
      // Should still work with mock plan
      expect(exec.replanCount).toBeGreaterThan(0);
      expect(exec.plan.steps).toBeDefined();
    });
  });
});
