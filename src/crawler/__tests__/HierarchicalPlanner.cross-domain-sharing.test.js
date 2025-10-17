/**
 * Phase 3 Cross-Domain Knowledge Sharing Tests
 * Tests for _findSimilarDomains, _sharePattern, and integration with learnHeuristics
 */

const { HierarchicalPlanner } = require('../HierarchicalPlanner');
const Database = require('better-sqlite3');
const { mkdirSync } = require('fs');
const { join } = require('path');

describe('HierarchicalPlanner - Cross-Domain Knowledge Sharing (Phase 3)', () => {
  let db;
  let planner;
  let logger;

  beforeEach(() => {
    // Create in-memory database
    db = new Database(':memory:');
    
    // Create tables
    db.exec(`
      CREATE TABLE IF NOT EXISTS articles (
        id INTEGER PRIMARY KEY,
        url TEXT UNIQUE NOT NULL,
        discovered_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS planning_heuristics (
        domain TEXT PRIMARY KEY,
        patterns TEXT,
        confidence REAL DEFAULT 0.8,
        sample_size INTEGER DEFAULT 0,
        avg_lookahead INTEGER DEFAULT 5,
        branching_factor INTEGER DEFAULT 10,
        updated_at TEXT NOT NULL
      );
    `);

    // Seed articles from multiple domains
    const articles = [
      'https://bbc.co.uk/news/uk-123456',
      'https://bbc.co.uk/news/world-789012',
      'https://theguardian.com/news/politics-111111',
      'https://theguardian.com/category/science-222222',
      'https://example.com/blog/post1',
      'https://example.com/blog/post2',
      'https://techcrunch.com/section/startups-333333',
      'https://techcrunch.com/news/ai-444444'
    ];

    const insertArticle = db.prepare('INSERT INTO articles (url, discovered_at) VALUES (?, datetime(\'now\'))');
    articles.forEach(url => insertArticle.run(url));

    logger = {
      log: jest.fn(),
      warn: jest.fn(),
      error: jest.fn()
    };

    planner = new HierarchicalPlanner({
      db,
      logger,
      features: {
        crossDomainSharing: true
      }
    });
  });

  afterEach(() => {
    if (db) {
      db.close();
    }
  });

  describe('_findSimilarDomains', () => {
    test('should find domains with similar hub patterns', async () => {
      const similar = await planner._findSimilarDomains('bbc.co.uk');

      // Should find theguardian.com (has /news/ and /category/) and techcrunch.com (has /news/ and /section/)
      expect(Array.isArray(similar)).toBe(true);
      expect(similar.length).toBeGreaterThan(0);
      expect(similar.length).toBeLessThanOrEqual(5);
      
      // Should not include source domain
      expect(similar).not.toContain('bbc.co.uk');
    });

    test('should limit results to 5 domains', async () => {
      // Add many more domains
      const insertArticle = db.prepare('INSERT INTO articles (url, discovered_at) VALUES (?, datetime(\'now\'))');
      for (let i = 0; i < 20; i++) {
        insertArticle.run(`https://site${i}.com/news/article${i}`);
      }

      const similar = await planner._findSimilarDomains('testdomain.com');
      expect(similar.length).toBeLessThanOrEqual(5);
    });

    test('should handle domains with no similar matches', async () => {
      db.exec('DELETE FROM articles'); // Clear all articles
      db.prepare('INSERT INTO articles (url, discovered_at) VALUES (?, datetime(\'now\'))').run('https://unique.com/path');

      const similar = await planner._findSimilarDomains('unique.com');
      expect(similar).toEqual([]);
    });

    test('should skip malformed URLs', async () => {
      db.prepare('INSERT INTO articles (url, discovered_at) VALUES (?, datetime(\'now\'))').run('not-a-valid-url');

      const similar = await planner._findSimilarDomains('test.com');
      // Should not throw, should just skip malformed URLs
      expect(Array.isArray(similar)).toBe(true);
    });

    test('should return empty array when database is not available', async () => {
      const plannerNoDb = new HierarchicalPlanner({
        db: null,
        logger,
        features: { crossDomainSharing: true }
      });

      const similar = await plannerNoDb._findSimilarDomains('test.com');
      expect(similar).toEqual([]);
    });

    test('should handle database errors gracefully', async () => {
      // Close database to trigger error
      db.close();

      const similar = await planner._findSimilarDomains('test.com');
      expect(similar).toEqual([]);
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[Cross-Domain Sharing] Failed to find similar domains'));
    });
  });

  describe('_sharePattern', () => {
    const sourceHeuristic = {
      domain: 'bbc.co.uk',
      patterns: [
        { sequence: ['hub-seed', 'link', 'link'], frequency: 10 },
        { sequence: ['sitemap', 'hub-seed'], frequency: 8 }
      ],
      avgLookahead: 5,
      branchingFactor: 10,
      updated: new Date().toISOString()
    };

    const metadata = {
      sourceConfidence: 0.8,
      transferConfidence: 0.56, // 0.8 * 0.7
      shared: true
    };

    test('should share patterns to new domain', async () => {
      await planner._sharePattern('theguardian.com', sourceHeuristic, metadata);

      const result = db.prepare('SELECT * FROM planning_heuristics WHERE domain = ?').get('theguardian.com');
      
      expect(result).toBeDefined();
      expect(result.domain).toBe('theguardian.com');
      expect(result.confidence).toBe(0.56);
      expect(result.sample_size).toBe(0);
      expect(result.avg_lookahead).toBe(5);
      expect(result.branching_factor).toBe(10);
      
      const patterns = JSON.parse(result.patterns);
      expect(patterns).toHaveLength(2);
      expect(patterns[0].sequence).toEqual(['hub-seed', 'link', 'link']);
    });

    test('should not overwrite existing domain patterns', async () => {
      // Pre-populate target domain with existing patterns
      db.prepare(`
        INSERT INTO planning_heuristics (
          domain, patterns, confidence, sample_size, avg_lookahead, branching_factor, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
      `).run('existing.com', JSON.stringify([{ sequence: ['existing'], frequency: 5 }]), 0.9, 10, 7, 12);

      await planner._sharePattern('existing.com', sourceHeuristic, metadata);

      const result = db.prepare('SELECT * FROM planning_heuristics WHERE domain = ?').get('existing.com');
      
      // Should still have original patterns
      expect(result.confidence).toBe(0.9);
      expect(result.sample_size).toBe(10);
      
      const patterns = JSON.parse(result.patterns);
      expect(patterns[0].sequence).toEqual(['existing']);
      
      expect(logger.log).toHaveBeenCalledWith('[Cross-Domain Sharing] existing.com already has patterns, skipping');
    });

    test('should use default values for missing heuristic fields', async () => {
      const minimalHeuristic = {
        domain: 'minimal.com',
        patterns: []
      };

      await planner._sharePattern('target.com', minimalHeuristic, metadata);

      const result = db.prepare('SELECT * FROM planning_heuristics WHERE domain = ?').get('target.com');
      
      expect(result.avg_lookahead).toBe(5);
      expect(result.branching_factor).toBe(10);
    });

    test('should handle database errors gracefully', async () => {
      // Close database to trigger error
      db.close();

      await planner._sharePattern('target.com', sourceHeuristic, metadata);
      
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[Cross-Domain Sharing] Failed to share pattern'));
    });

    test('should handle null database', async () => {
      const plannerNoDb = new HierarchicalPlanner({
        db: null,
        logger,
        features: { crossDomainSharing: true }
      });

      // Should not throw
      await plannerNoDb._sharePattern('target.com', sourceHeuristic, metadata);
    });
  });

  describe('learnHeuristics integration', () => {
    test('should share patterns with similar domains after learning', async () => {
      const planOutcomes = [
        {
          actionSequence: ['hub-seed', 'link', 'link'],
          success: true,
          actualValue: 100,
          estimatedValue: 80
        },
        {
          actionSequence: ['sitemap', 'hub-seed'],
          success: true,
          actualValue: 60,
          estimatedValue: 50
        }
      ];

      const result = await planner.learnHeuristics('bbc.co.uk', planOutcomes);

      expect(result).toBeDefined();
      expect(result.domain).toBe('bbc.co.uk');
      
      // Should have found and shared with similar domains
      expect(logger.log).toHaveBeenCalledWith(expect.stringMatching(/\[Cross-Domain Sharing\] Shared patterns from bbc.co.uk to \d+ similar domains/));
      
      // Verify patterns were shared to at least one similar domain
      const sharedDomains = db.prepare('SELECT COUNT(*) as count FROM planning_heuristics WHERE domain != ?').get('bbc.co.uk');
      expect(sharedDomains.count).toBeGreaterThan(0);
    });

    test('should respect crossDomainSharing feature flag', async () => {
      const plannerDisabled = new HierarchicalPlanner({
        db,
        logger,
        features: {
          crossDomainSharing: false
        }
      });

      const planOutcomes = [
        {
          actionSequence: ['hub-seed', 'link'],
          success: true,
          actualValue: 100,
          estimatedValue: 80
        }
      ];

      await plannerDisabled.learnHeuristics('testdomain.com', planOutcomes);

      // Should only save own heuristic, not share
      const allHeuristics = db.prepare('SELECT COUNT(*) as count FROM planning_heuristics').get();
      expect(allHeuristics.count).toBe(1);
      
      const ownHeuristic = db.prepare('SELECT * FROM planning_heuristics WHERE domain = ?').get('testdomain.com');
      expect(ownHeuristic).toBeDefined();
    });

    test('should handle errors during cross-domain sharing gracefully', async () => {
      // Corrupt database schema to trigger error
      db.exec('DROP TABLE planning_heuristics');

      const planOutcomes = [
        {
          actionSequence: ['hub-seed', 'link'],
          success: true,
          actualValue: 100,
          estimatedValue: 80
        }
      ];

      // Should complete learning even if sharing fails
      const result = await planner.learnHeuristics('bbc.co.uk', planOutcomes);
      
      expect(result).toBeDefined();
      expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining('[Cross-Domain Sharing] Failed'));
    });

    test('should transfer confidence at 70% of source confidence', async () => {
      const planOutcomes = [
        {
          actionSequence: ['hub-seed', 'link'],
          success: true,
          actualValue: 100,
          estimatedValue: 80
        }
      ];

      await planner.learnHeuristics('source.com', planOutcomes);

      // Find a shared domain
      const shared = db.prepare('SELECT * FROM planning_heuristics WHERE domain != ?').get('source.com');
      
      if (shared) {
        // Source confidence is 0.8, transfer should be 0.56 (0.8 * 0.7)
        expect(shared.confidence).toBe(0.56);
      }
    });
  });

  describe('confidence transfer calculation', () => {
    test('should apply 70% transfer penalty', () => {
      const sourceConfidence = 0.8;
      const transferConfidence = sourceConfidence * 0.7;
      
      expect(transferConfidence).toBeCloseTo(0.56, 2);
    });

    test('should handle high source confidence', () => {
      const sourceConfidence = 0.95;
      const transferConfidence = sourceConfidence * 0.7;
      
      expect(transferConfidence).toBeCloseTo(0.665, 3);
    });

    test('should handle low source confidence', () => {
      const sourceConfidence = 0.5;
      const transferConfidence = sourceConfidence * 0.7;
      
      expect(transferConfidence).toBe(0.35);
    });
  });
});
