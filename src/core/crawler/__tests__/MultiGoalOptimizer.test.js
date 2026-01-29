/**
 * Tests for MultiGoalOptimizer - Balance competing objectives
 */

const { MultiGoalOptimizer } = require('../MultiGoalOptimizer');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('MultiGoalOptimizer', () => {
  let db;
  let optimizer;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    tempDbPath = path.join(__dirname, `test-optimizer-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    db.exec(`
      CREATE TABLE IF NOT EXISTS goal_optimizations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        domain TEXT NOT NULL,
        goal_weights TEXT NOT NULL,
        selected_action TEXT,
        pareto_optimal INTEGER,
        outcome_metrics TEXT,
        success_score REAL,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
    `);
    
    mockLogger = {
      log: jest.fn(),
      error: jest.fn()
    };
    
    optimizer = new MultiGoalOptimizer({ db, logger: mockLogger });
  });

  afterEach(() => {
    if (optimizer) {
      optimizer.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('setWeights', () => {
    test('accepts valid weights that sum to 1.0', () => {
      const weights = optimizer.setWeights({
        breadth: 0.3,
        depth: 0.3,
        speed: 0.2,
        efficiency: 0.2
      });
      
      expect(weights.breadth).toBe(0.3);
      expect(weights.depth).toBe(0.3);
      expect(weights.speed).toBe(0.2);
      expect(weights.efficiency).toBe(0.2);
    });

    test('throws error if weights do not sum to 1.0', () => {
      expect(() => {
        optimizer.setWeights({
          breadth: 0.5,
          depth: 0.5,
          speed: 0.5,
          efficiency: 0.5
        });
      }).toThrow('Weights must sum to 1.0');
    });

    test('uses default weights for missing values', () => {
      const weights = optimizer.setWeights({
        breadth: 0.4,
        depth: 0.6
      });
      
      expect(weights.breadth).toBe(0.4);
      expect(weights.depth).toBe(0.6);
      expect(weights.speed).toBe(0.25); // Default
      expect(weights.efficiency).toBe(0.25); // Default
    });
  });

  describe('optimizeAction', () => {
    test('selects action based on weighted scores', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country', estimatedArticles: 100, estimatedRequests: 5, estimatedTime: 30000 },
        { url: '/hub2', hubType: 'city', estimatedArticles: 50, estimatedRequests: 10, estimatedTime: 60000 },
        { url: '/hub3', hubType: 'topic', estimatedArticles: 200, estimatedRequests: 20, estimatedTime: 90000 }
      ];

      const result = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        currentProgress: { hubsDiscovered: 10, totalHubsEstimate: 100 }
      });

      expect(result.action).toBeDefined();
      expect(result.weights).toBeDefined();
      expect(result.paretoFrontier).toBeDefined();
      expect(result.reasoning).toBeDefined();
    });

    test('adjusts weights based on progress (breadth → depth)', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country', estimatedArticles: 100, estimatedRequests: 5 }
      ];

      const result = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        currentProgress: {
          hubsDiscovered: 85,
          totalHubsEstimate: 100,
          completionPercent: 0.85
        }
      });

      // When 85% discovered, should shift from breadth to depth
      expect(result.weights.depth).toBeGreaterThan(0.25);
      expect(result.weights.breadth).toBeLessThan(0.25);
    });

    test('adjusts weights when 90% complete (depth → speed)', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country', estimatedArticles: 100, estimatedRequests: 5 }
      ];

      const result = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        currentProgress: {
          completionPercent: 0.92
        }
      });

      expect(result.weights.speed).toBeGreaterThan(0.25);
      expect(result.weights.depth).toBeLessThan(0.25);
    });

    test('increases exploration on plateau', async () => {
      const candidates = [
        { url: '/hub1', hubType: 'country', estimatedArticles: 100, estimatedRequests: 5 }
      ];

      const result = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        currentProgress: {
          plateauDetected: true
        }
      });

      expect(result.weights.breadth).toBeGreaterThan(0.25);
    });
  });

  describe('Pareto Optimization', () => {
    test('identifies Pareto optimal solutions', async () => {
      const candidates = [
        { url: '/hub1', estimatedArticles: 100, estimatedRequests: 10, estimatedTime: 30000 }, // Balanced
        { url: '/hub2', estimatedArticles: 200, estimatedRequests: 50, estimatedTime: 90000 }, // High depth, expensive
        { url: '/hub3', estimatedArticles: 50, estimatedRequests: 5, estimatedTime: 10000 },  // Fast, efficient
        { url: '/hub4', estimatedArticles: 80, estimatedRequests: 40, estimatedTime: 80000 }  // Dominated
      ];

      const result = await optimizer.optimizeAction(candidates, {
        domain: 'example.com'
      });

      // hub1, hub2, hub3 should be Pareto optimal
      // hub4 is dominated by hub1 (same articles, more requests/time)
      expect(result.paretoFrontier.length).toBeGreaterThan(0);
      expect(result.paretoFrontier.length).toBeLessThanOrEqual(3);
    });

    test('selects from Pareto frontier based on weights', async () => {
      const candidates = [
        { url: '/fast', estimatedArticles: 50, estimatedRequests: 5, estimatedTime: 10000 },
        { url: '/thorough', estimatedArticles: 200, estimatedRequests: 20, estimatedTime: 60000 }
      ];

      // Prefer speed
      const speedResult = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        weights: { breadth: 0.1, depth: 0.1, speed: 0.6, efficiency: 0.2 }
      });

      expect(speedResult.action.url).toBe('/fast');

      // Prefer depth
      const depthResult = await optimizer.optimizeAction(candidates, {
        domain: 'example.com',
        weights: { breadth: 0.1, depth: 0.6, speed: 0.1, efficiency: 0.2 }
      });

      expect(depthResult.action.url).toBe('/thorough');
    });
  });

  describe('evaluateOutcome', () => {
    test('evaluates outcome against goals', () => {
      const outcome = {
        hubTypesDiscovered: 8,
        totalHubTypes: 10,
        articlesCollected: 500,
        hubsCrawled: 10,
        timeElapsed: 300000,
        estimatedTime: 400000,
        requestsMade: 50
      };

      const goals = { breadth: 0.25, depth: 0.25, speed: 0.25, efficiency: 0.25 };
      const result = optimizer.evaluateOutcome(outcome, goals);

      expect(result.scores).toBeDefined();
      expect(result.scores.breadth).toBeGreaterThan(0);
      expect(result.scores.depth).toBeGreaterThan(0);
      expect(result.scores.speed).toBeGreaterThan(0);
      expect(result.scores.efficiency).toBeGreaterThan(0);
      expect(result.overallScore).toBeGreaterThan(0);
    });

    test('scores breadth based on hub type coverage', () => {
      const fullCoverage = optimizer.evaluateOutcome({
        hubTypesDiscovered: 10,
        totalHubTypes: 10
      }, optimizer.defaultWeights);

      const partialCoverage = optimizer.evaluateOutcome({
        hubTypesDiscovered: 5,
        totalHubTypes: 10
      }, optimizer.defaultWeights);

      expect(fullCoverage.scores.breadth).toBe(1.0);
      expect(partialCoverage.scores.breadth).toBe(0.5);
    });

    test('scores efficiency based on articles/requests ratio', () => {
      const efficient = optimizer.evaluateOutcome({
        articlesCollected: 200,
        requestsMade: 10 // 20:1 ratio
      }, optimizer.defaultWeights);

      const inefficient = optimizer.evaluateOutcome({
        articlesCollected: 10,
        requestsMade: 10 // 1:1 ratio
      }, optimizer.defaultWeights);

      expect(efficient.scores.efficiency).toBeGreaterThan(inefficient.scores.efficiency);
    });
  });

  describe('Domain Learning', () => {
    test('learns optimal weights from historical data', async () => {
      // Insert historical optimizations
      for (let i = 0; i < 20; i++) {
        const weights = {
          breadth: 0.3 + Math.random() * 0.2,
          depth: 0.25,
          speed: 0.25,
          efficiency: 0.2
        };

        db.prepare(`
          INSERT INTO goal_optimizations (domain, goal_weights, success_score)
          VALUES (?, ?, ?)
        `).run('example.com', JSON.stringify(weights), 0.7 + Math.random() * 0.3);
      }

      const profile = await optimizer.learnDomainProfile('example.com');

      expect(profile).toBeDefined();
      expect(profile.optimalWeights).toBeDefined();
      expect(profile.sampleSize).toBeGreaterThan(0);
      expect(profile.avgSuccess).toBeGreaterThan(0);
    });

    test('returns null for domains with insufficient data', async () => {
      const profile = await optimizer.learnDomainProfile('newdomain.com');
      expect(profile).toBeNull();
    });

    test('caches learned domain profiles', async () => {
      // Insert data
      db.prepare(`
        INSERT INTO goal_optimizations (domain, goal_weights, success_score)
        VALUES (?, ?, ?)
      `).run('example.com', JSON.stringify(optimizer.defaultWeights), 0.8);

      await optimizer.learnDomainProfile('example.com');

      // Check cache
      const cachedProfile = optimizer.domainProfiles.get('example.com');
      expect(cachedProfile).toBeDefined();
    });

    test('recommends learned weights for known domains', async () => {
      db.prepare(`
        INSERT INTO goal_optimizations (domain, goal_weights, success_score)
        VALUES (?, ?, ?)
      `).run('example.com', JSON.stringify({ breadth: 0.4, depth: 0.3, speed: 0.2, efficiency: 0.1 }), 0.9);

      const weights = await optimizer.getRecommendedWeights('example.com');

      expect(weights).toBeDefined();
      // Should be influenced by high-scoring historical data
    });

    test('returns default weights for unknown domains', async () => {
      const weights = await optimizer.getRecommendedWeights('unknown.com');
      expect(weights).toEqual(optimizer.defaultWeights);
    });
  });

  describe('getStats', () => {
    test('returns optimizer statistics', () => {
      const stats = optimizer.getStats();

      expect(stats.paretoFrontierSize).toBeDefined();
      expect(stats.solutionsCached).toBeDefined();
      expect(stats.domainsLearned).toBeDefined();
      expect(stats.defaultWeights).toEqual(optimizer.defaultWeights);
      expect(stats.thresholds).toBeDefined();
    });
  });

  describe('close', () => {
    test('clears all caches', () => {
      optimizer.paretoFrontier = [{}, {}];
      optimizer.solutionCache.set('key', 'value');
      optimizer.domainProfiles.set('domain', {});

      optimizer.close();

      expect(optimizer.paretoFrontier).toEqual([]);
      expect(optimizer.solutionCache.size).toBe(0);
      expect(optimizer.domainProfiles.size).toBe(0);
    });
  });
});
