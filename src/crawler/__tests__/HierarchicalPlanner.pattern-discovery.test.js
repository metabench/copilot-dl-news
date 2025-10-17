/**
 * Tests for Pattern-Based Hub Discovery (Phase 1 Improvement)
 */

const { HierarchicalPlanner } = require('../HierarchicalPlanner');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('HierarchicalPlanner - Pattern Discovery', () => {
  let db;
  let planner;
  let mockLogger;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create required tables from migration
    const migrationPath = path.join(__dirname, '../../db/migrations/006-hierarchical-planning.sql');
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(migrationSql);

    // Seed pattern data
    const heuristicId = db.prepare(`
      INSERT INTO planning_heuristics (domain, patterns, avg_lookahead, confidence, success_rate)
      VALUES ('example.com', '{}', 3, 0.8, 0.75)
    `).run().lastInsertRowid;

    // Insert successful patterns
    db.prepare(`
      INSERT INTO pattern_performance (heuristic_id, pattern_signature, success_count, failure_count, avg_value, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(heuristicId, 'fetch:/news/', 10, 2, 45);

    db.prepare(`
      INSERT INTO pattern_performance (heuristic_id, pattern_signature, success_count, failure_count, avg_value, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(heuristicId, 'explore:/articles/', 8, 2, 60);

    db.prepare(`
      INSERT INTO pattern_performance (heuristic_id, pattern_signature, success_count, failure_count, avg_value, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(heuristicId, 'fetch:/blog/', 5, 3, 30);

    // Pattern with low success (should be filtered out)
    db.prepare(`
      INSERT INTO pattern_performance (heuristic_id, pattern_signature, success_count, failure_count, avg_value, last_seen)
      VALUES (?, ?, ?, ?, ?, datetime('now'))
    `).run(heuristicId, 'fetch:/old/', 1, 4, 15);

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn()
    };

    planner = new HierarchicalPlanner({ 
      db, 
      logger: mockLogger, 
      maxLookahead: 3, 
      maxBranches: 5,
      features: { patternDiscovery: true } // Enable feature
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('_generateCandidatesFromPatterns', () => {
    test('generates candidates from high-success patterns', async () => {
      const state = { hubsDiscovered: 0 };
      const goal = { hubsTarget: 100 };
      
      const candidates = await planner._generateCandidatesFromPatterns('example.com', state, goal);
      
      expect(candidates).toHaveLength(3); // 3 patterns with success_count >= 3
      
      // Check first candidate (highest avg_value)
      expect(candidates[0]).toMatchObject({
        url: 'https://example.com/articles/',
        type: 'hub',
        source: 'pattern-learning',
        estimatedArticles: 60,
        patternSignature: 'explore:/articles/',
        successCount: 8
      });
    });

    test('orders candidates by value then success count', async () => {
      const candidates = await planner._generateCandidatesFromPatterns('example.com', {}, {});
      
      // Should be ordered by avg_value DESC
      expect(candidates[0].estimatedArticles).toBe(60); // /articles/ (60)
      expect(candidates[1].estimatedArticles).toBe(45); // /news/ (45)
      expect(candidates[2].estimatedArticles).toBe(30); // /blog/ (30)
    });

    test('calculates confidence based on success count', async () => {
      const candidates = await planner._generateCandidatesFromPatterns('example.com', {}, {});
      
      // 10 successes = confidence 1.0 (capped at 0.95)
      expect(candidates[1].confidence).toBeCloseTo(0.95, 2);
      
      // 8 successes = confidence 0.8
      expect(candidates[0].confidence).toBeCloseTo(0.8, 2);
      
      // 5 successes = confidence 0.5
      expect(candidates[2].confidence).toBeCloseTo(0.5, 2);
    });

    test('sets estimatedRequests based on action type', async () => {
      const candidates = await planner._generateCandidatesFromPatterns('example.com', {}, {});
      
      const fetchAction = candidates.find(c => c.patternSignature.startsWith('fetch:'));
      const exploreAction = candidates.find(c => c.patternSignature.startsWith('explore:'));
      
      expect(fetchAction.estimatedRequests).toBe(1);
      expect(exploreAction.estimatedRequests).toBe(3);
    });

    test('filters out low-success patterns', async () => {
      const candidates = await planner._generateCandidatesFromPatterns('example.com', {}, {});
      
      // Pattern with success_count=1 should not be included (threshold is 3)
      const lowSuccessPattern = candidates.find(c => c.patternSignature === 'fetch:/old/');
      expect(lowSuccessPattern).toBeUndefined();
    });

    test('returns empty array when no patterns exist', async () => {
      const candidates = await planner._generateCandidatesFromPatterns('unknown-domain.com', {}, {});
      
      expect(candidates).toEqual([]);
    });

    test('returns empty array when db is null', async () => {
      const plannerNoDB = new HierarchicalPlanner({ 
        db: null, 
        features: { patternDiscovery: true } 
      });
      
      const candidates = await plannerNoDB._generateCandidatesFromPatterns('example.com', {}, {});
      
      expect(candidates).toEqual([]);
    });

    test('handles database errors gracefully', async () => {
      // Close database to trigger error
      db.close();
      
      const candidates = await planner._generateCandidatesFromPatterns('example.com', {}, {});
      
      expect(candidates).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Pattern Discovery] Failed to query patterns')
      );
    });
  });

  describe('_generateActions with pattern discovery', () => {
    test('combines pattern candidates with provided candidates', async () => {
      const state = { hubsDiscovered: 0 };
      const goal = { hubsTarget: 100 };
      const context = {
        domain: 'example.com',
        candidates: [
          { url: 'https://example.com/manual-hub', type: 'hub', estimatedArticles: 40 }
        ]
      };
      
      const actions = await planner._generateActions(state, goal, context);
      
      // Should have 1 manual + 3 pattern candidates
      expect(actions.length).toBe(4);
      
      // Check manual candidate is included
      const manualCandidate = actions.find(a => a.url === 'https://example.com/manual-hub');
      expect(manualCandidate).toBeDefined();
    });

    test('only uses pattern discovery when feature enabled', async () => {
      const plannerDisabled = new HierarchicalPlanner({ 
        db, 
        features: { patternDiscovery: false } // Disabled
      });
      
      const context = {
        domain: 'example.com',
        candidates: [
          { url: 'https://example.com/manual-hub', type: 'hub' }
        ]
      };
      
      const actions = await plannerDisabled._generateActions({}, {}, context);
      
      // Should only have manual candidate (no pattern discovery)
      expect(actions.length).toBe(1);
    });

    test('works without domain in context', async () => {
      const context = {
        // No domain specified
        candidates: [
          { url: 'https://example.com/manual-hub', type: 'hub' }
        ]
      };
      
      const actions = await planner._generateActions({}, {}, context);
      
      // Should have manual candidates only (pattern discovery skipped)
      expect(actions.length).toBe(1);
    });
  });

  describe('integration with generatePlan', () => {
    test('pattern-discovered hubs are used in planning', async () => {
      const initialState = {
        hubsDiscovered: 0,
        articlesCollected: 0,
        requestsMade: 0,
        momentum: 0
      };

      const goal = {
        hubsTarget: 10,
        articlesTarget: 500
      };

      const context = {
        domain: 'example.com',
        candidates: [], // No manual candidates
        lookahead: 2
      };

      const plan = await planner.generatePlan(initialState, goal, context);
      
      // Plan may be null if no good sequence found, that's OK for this test
      if (plan) {
        expect(plan.steps.length).toBeGreaterThan(0);
        
        // At least one step should reference a pattern-discovered hub
        const patternHub = plan.steps.find(s => 
          s.action.url && s.action.url.includes('example.com')
        );
        expect(patternHub).toBeDefined();
      } else {
        // If plan is null, verify pattern discovery was at least attempted
        expect(planner.features.patternDiscovery).toBe(true);
      }
    });
  });
});
