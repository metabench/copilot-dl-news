/**
 * Tests for Adaptive Branching (Phase 2 Improvement)
 */

const { HierarchicalPlanner } = require('../HierarchicalPlanner');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('HierarchicalPlanner - Adaptive Branching', () => {
  let db;
  let planner;
  let mockLogger;

  beforeEach(() => {
    db = new Database(':memory:');
    
    // Create minimal schema for domain profile
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        url TEXT NOT NULL,
        domain TEXT
      );
    `);

    mockLogger = {
      log: jest.fn(),
      warn: jest.fn()
    };

    planner = new HierarchicalPlanner({ 
      db, 
      logger: mockLogger,
      maxLookahead: 5,
      maxBranches: 10,
      features: { adaptiveBranching: true }
    });
  });

  afterEach(() => {
    db.close();
  });

  describe('_analyzeDomainProfile', () => {
    test('returns profile for known domain', async () => {
      // Seed domain data
      db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run('https://example.com/page1', 'example.com');
      db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run('https://example.com/page2', 'example.com');
      db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run('https://example.com/category/news', 'example.com');
      
      const profile = await planner._analyzeDomainProfile('example.com');
      
      expect(profile).toHaveProperty('pageCount');
      expect(profile).toHaveProperty('hubTypeCount');
      expect(profile).toHaveProperty('complexity');
      expect(profile.pageCount).toBeGreaterThan(0);
    });

    test('returns default profile for unknown domain', async () => {
      const profile = await planner._analyzeDomainProfile('unknown-domain.com');
      
      expect(profile.pageCount).toBe(0);
      expect(profile.hubTypeCount).toBe(1);
      // Complexity = Math.log10(0 + 10) * 1 / 5 = 1 * 1 / 5 = 0.2
      expect(profile.complexity).toBeCloseTo(0.2, 1);
    });

    test('handles database errors gracefully', async () => {
      db.close(); // Force error
      
      const profile = await planner._analyzeDomainProfile('example.com');
      
      expect(profile).toEqual({
        pageCount: 0,
        hubTypeCount: 1,
        complexity: 1
      });
      expect(mockLogger.warn).toHaveBeenCalledWith(
        expect.stringContaining('[Adaptive Branching] Profile analysis failed')
      );
    });

    test('calculates complexity correctly', async () => {
      // Small domain
      for (let i = 0; i < 10; i++) {
        db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run(`https://small.com/page${i}`, 'small.com');
      }
      
      // Large domain with hubs
      for (let i = 0; i < 1000; i++) {
        const url = i % 10 === 0 
          ? `https://large.com/category/cat${Math.floor(i/10)}`
          : `https://large.com/article${i}`;
        db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run(url, 'large.com');
      }
      
      const smallProfile = await planner._analyzeDomainProfile('small.com');
      const largeProfile = await planner._analyzeDomainProfile('large.com');
      
      expect(largeProfile.complexity).toBeGreaterThan(smallProfile.complexity);
    });
  });

  describe('_calculateOptimalLookahead', () => {
    test('returns 3 for small targets (<1000)', () => {
      const goal = { articlesTarget: 500 };
      const profile = { pageCount: 100, hubTypeCount: 3, complexity: 2 };
      
      const lookahead = planner._calculateOptimalLookahead(profile, goal);
      
      expect(lookahead).toBe(3);
    });

    test('returns 5 for medium targets (1000-10000)', () => {
      const goal = { articlesTarget: 5000 };
      const profile = { pageCount: 1000, hubTypeCount: 10, complexity: 5 };
      
      const lookahead = planner._calculateOptimalLookahead(profile, goal);
      
      expect(lookahead).toBe(5);
    });

    test('returns 7 for large targets (>10000)', () => {
      const goal = { articlesTarget: 50000 };
      const profile = { pageCount: 10000, hubTypeCount: 20, complexity: 10 };
      
      const lookahead = planner._calculateOptimalLookahead(profile, goal);
      
      expect(lookahead).toBe(7);
    });

    test('handles missing articlesTarget', () => {
      const goal = {};
      const profile = { pageCount: 100, hubTypeCount: 3, complexity: 2 };
      
      const lookahead = planner._calculateOptimalLookahead(profile, goal);
      
      expect(lookahead).toBe(5); // Default to medium
    });
  });

  describe('_calculateOptimalBranching', () => {
    test('returns 5 for simple structures', () => {
      const profile = { hubTypeCount: 3, complexity: 2 };
      
      const branches = planner._calculateOptimalBranching(profile);
      
      expect(branches).toBe(5);
    });

    test('returns 10 for medium complexity', () => {
      const profile = { hubTypeCount: 10, complexity: 5 };
      
      const branches = planner._calculateOptimalBranching(profile);
      
      expect(branches).toBe(10);
    });

    test('returns 15 for high complexity', () => {
      const profile = { hubTypeCount: 20, complexity: 10 };
      
      const branches = planner._calculateOptimalBranching(profile);
      
      expect(branches).toBe(15);
    });

    test('uses complexity when hubTypeCount is low but complexity high', () => {
      const profile = { hubTypeCount: 3, complexity: 9 };
      
      const branches = planner._calculateOptimalBranching(profile);
      
      // Logic: hubTypeCount < 5 OR complexity < 3 → 5 branches
      // Here: hubTypeCount (3) < 5 → returns 5, even though complexity is high
      expect(branches).toBe(5);
    });

    test('returns 15 for high hubTypeCount even if complexity moderate', () => {
      const profile = { hubTypeCount: 20, complexity: 5 };
      
      const branches = planner._calculateOptimalBranching(profile);
      
      // hubTypeCount >= 15 AND complexity >= 8 → 15 branches
      // Here: hubTypeCount (20) >= 15 but complexity (5) < 8 → 10 branches
      expect(branches).toBe(10);
    });
  });

  describe('generatePlan with adaptive branching', () => {
    test('adapts lookahead and branches for small domain', async () => {
      // Seed small domain
      for (let i = 0; i < 50; i++) {
        db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run(`https://small.com/page${i}`, 'small.com');
      }
      
      const initialState = { hubsDiscovered: 0, articlesCollected: 0 };
      const goal = { articlesTarget: 500 }; // Small target
      const context = { 
        domain: 'small.com', 
        candidates: [
          { type: 'hub', url: 'https://small.com/news', estimatedArticles: 50 }
        ]
      };
      
      await planner.generatePlan(initialState, goal, context);
      
      // Verify adaptive parameters were logged
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringContaining('[Adaptive Branching]')
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Lookahead: 3/) // Small domain → 3 steps
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Branches: 5/) // Simple structure → 5 branches
      );
    });

    test('adapts for large complex domain', async () => {
      // Seed large domain
      for (let i = 0; i < 5000; i++) {
        const url = i % 20 === 0
          ? `https://large.com/section/sec${Math.floor(i/20)}`
          : `https://large.com/article${i}`;
        db.prepare('INSERT INTO articles (url, domain) VALUES (?, ?)').run(url, 'large.com');
      }
      
      const initialState = { hubsDiscovered: 0, articlesCollected: 0 };
      const goal = { articlesTarget: 50000 }; // Large target
      const context = {
        domain: 'large.com',
        candidates: [
          { type: 'hub', url: 'https://large.com/news', estimatedArticles: 500 }
        ]
      };
      
      await planner.generatePlan(initialState, goal, context);
      
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Lookahead: 7/) // Large domain → 7 steps
      );
      expect(mockLogger.log).toHaveBeenCalledWith(
        expect.stringMatching(/Branches: (10|15)/) // Complex structure → 10-15 branches
      );
    });

    test('uses defaults when feature disabled', async () => {
      const plannerNoAdaptive = new HierarchicalPlanner({
        db,
        logger: mockLogger,
        maxLookahead: 5,
        maxBranches: 10,
        features: { adaptiveBranching: false } // Disabled
      });

      const initialState = { hubsDiscovered: 0, articlesCollected: 0 };
      const goal = { articlesTarget: 500 };
      const context = {
        domain: 'example.com',
        candidates: [{ type: 'hub', url: 'https://example.com/news', estimatedArticles: 50 }]
      };

      await plannerNoAdaptive.generatePlan(initialState, goal, context);

      // Should NOT log adaptive branching
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[Adaptive Branching]')
      );
    });

    test('uses defaults when no domain provided', async () => {
      const initialState = { hubsDiscovered: 0, articlesCollected: 0 };
      const goal = { articlesTarget: 5000 };
      const context = {
        // No domain specified
        candidates: [{ type: 'hub', url: 'https://example.com/news', estimatedArticles: 50 }]
      };

      await planner.generatePlan(initialState, goal, context);

      // Should NOT log adaptive branching (no domain)
      expect(mockLogger.log).not.toHaveBeenCalledWith(
        expect.stringContaining('[Adaptive Branching]')
      );
    });
  });
});
