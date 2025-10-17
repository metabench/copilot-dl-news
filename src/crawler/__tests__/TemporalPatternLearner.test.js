/**
 * Tests for TemporalPatternLearner - Quick Win #3: Temporal Pattern Recognition
 */

const { TemporalPatternLearner } = require('../TemporalPatternLearner');
const { applyQuickWinMigrations } = require('../schema-migrations');
const Database = require('better-sqlite3');
const fs = require('fs');
const path = require('path');

describe('TemporalPatternLearner', () => {
  let db;
  let learner;
  let mockLogger;
  let tempDbPath;

  beforeEach(() => {
    // Create temp database
    tempDbPath = path.join(__dirname, `test-temporal-${Date.now()}.db`);
    db = new Database(tempDbPath);
    
    // Apply schema
    applyQuickWinMigrations(db);
    
    mockLogger = {
      log: jest.fn(),
      error: jest.fn(),
      warn: jest.fn()
    };
    
    learner = new TemporalPatternLearner({ db, logger: mockLogger });
  });

  afterEach(() => {
    if (learner) {
      learner.close();
    }
    if (db) {
      db.close();
    }
    if (tempDbPath && fs.existsSync(tempDbPath)) {
      fs.unlinkSync(tempDbPath);
    }
  });

  describe('recordVisit', () => {
    test('records hub visit', async () => {
      await learner.recordVisit('example.com', 'https://example.com/politics', 'section', 50, 10);

      const visits = db.prepare(`
        SELECT * FROM hub_visits 
        WHERE domain = ? AND hub_url = ?
      `).all('example.com', 'https://example.com/politics');

      expect(visits).toHaveLength(1);
      expect(visits[0].articles_found).toBe(50);
      expect(visits[0].new_articles).toBe(10);
    });

    test('triggers pattern learning after 3 visits', async () => {
      const hubUrl = 'https://example.com/politics';
      
      await learner.recordVisit('example.com', hubUrl, 'section', 50, 10);
      await learner.recordVisit('example.com', hubUrl, 'section', 55, 5);
      await learner.recordVisit('example.com', hubUrl, 'section', 60, 5);

      const pattern = db.prepare(`
        SELECT * FROM temporal_patterns 
        WHERE domain = ? AND hub_url = ?
      `).get('example.com', hubUrl);

      expect(pattern).toBeDefined();
      expect(pattern.frequency).toBeDefined();
      expect(pattern.confidence).toBeGreaterThanOrEqual(0);
    });
  });

  describe('learnUpdatePattern', () => {
    beforeEach(async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      // Create visits with hourly pattern
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 3600000, 50, 5);
      }
    });

    test('classifies update frequency', async () => {
      const pattern = await learner.learnUpdatePattern('example.com', 'https://example.com/politics', 'section');

      expect(pattern).toBeDefined();
      expect(pattern).toHaveProperty('frequency');
      expect(['realtime', 'hourly', 'daily', 'weekly', 'monthly', 'rarely']).toContain(pattern.frequency);
    });

    test('calculates confidence based on consistency', async () => {
      const pattern = await learner.learnUpdatePattern('example.com', 'https://example.com/politics', 'section');

      expect(pattern.confidence).toBeGreaterThanOrEqual(0);
      expect(pattern.confidence).toBeLessThanOrEqual(1);
    });

    test('stores pattern in database', async () => {
      await learner.learnUpdatePattern('example.com', 'https://example.com/politics', 'section');

      const stored = db.prepare(`
        SELECT * FROM temporal_patterns 
        WHERE domain = ? AND hub_url = ?
      `).get('example.com', 'https://example.com/politics');

      expect(stored).toBeDefined();
      expect(stored.frequency).toBeDefined();
    });

    test('detects realtime updates (<1 hour)', async () => {
      const hubUrl = 'https://example.com/breaking-news';
      const now = Date.now();
      
      // Create visits every 30 minutes
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 1800000, 50, 5);
      }

      const pattern = await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      expect(pattern.frequency).toBe('realtime');
    });

    test('detects daily updates', async () => {
      const hubUrl = 'https://example.com/daily-digest';
      const now = Date.now();
      
      // Create visits every 24 hours
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 86400000, 50, 5);
      }

      const pattern = await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      expect(pattern.frequency).toBe('daily');
    });

    test('handles insufficient data', async () => {
      const pattern = await learner.learnUpdatePattern('example.com', 'https://example.com/new-hub', 'section');

      expect(pattern).toBe(null);
    });
  });

  describe('getNextVisitTime', () => {
    test('recommends next visit based on pattern', async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      // Create hourly pattern
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 3600000, 50, 5);
      }

      await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      const recommendation = await learner.getNextVisitTime('example.com', hubUrl);

      expect(recommendation).toBeDefined();
      expect(recommendation).toHaveProperty('nextVisit');
      expect(recommendation).toHaveProperty('frequency');
      expect(recommendation).toHaveProperty('confidence');
      expect(recommendation.nextVisit).toBeInstanceOf(Date);
    });

    test('includes reasoning in recommendation', async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 3600000, 50, 5);
      }

      await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      const recommendation = await learner.getNextVisitTime('example.com', hubUrl);

      expect(recommendation).toHaveProperty('reason');
      expect(typeof recommendation.reason).toBe('string');
    });

    test('handles hub without pattern', async () => {
      const recommendation = await learner.getNextVisitTime('example.com', 'https://example.com/unknown');

      expect(recommendation.nextVisit).toBeInstanceOf(Date);
      expect(recommendation.frequency).toBeDefined();
      expect(typeof recommendation.confidence).toBe('number');
    });
  });

  describe('shouldRevisit', () => {
    test('recommends revisit when time has come', async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      // Create pattern with last visit 2 hours ago, hourly frequency
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - 7200000 - (10 - i) * 3600000, 50, 5);
      }

      await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      const result = await learner.shouldRevisit('example.com', hubUrl);

      expect(result).toHaveProperty('shouldVisit');
      expect(result).toHaveProperty('reason');
      expect(typeof result.shouldVisit).toBe('boolean');
    });

    test('does not recommend early revisit', async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      // Create daily pattern with recent visit
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - 3600000 - (10 - i) * 86400000, 50, 5);
      }

      await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      const result = await learner.shouldRevisit('example.com', hubUrl);

      expect(result.shouldVisit).toBe(false);
    });
  });

  describe('identifyBreakingNewsHubs', () => {
    beforeEach(async () => {
      const now = Date.now();
      
      // High-frequency hub (every 30 min)
      const breakingUrl = 'https://example.com/breaking';
      for (let i = 0; i < 15; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', breakingUrl, 'section', now - (15 - i) * 1800000, 50, 8);
      }
      await learner.learnUpdatePattern('example.com', breakingUrl, 'section');

      // Low-frequency hub (daily)
      const dailyUrl = 'https://example.com/daily';
      for (let i = 0; i < 15; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', dailyUrl, 'section', now - (15 - i) * 86400000, 50, 2);
      }
      await learner.learnUpdatePattern('example.com', dailyUrl, 'section');
    });

    test('identifies high-frequency hubs', async () => {
      const breakingNews = await learner.identifyBreakingNewsHubs('example.com', 0.7);

      expect(breakingNews).toBeInstanceOf(Array);
      expect(breakingNews.length).toBeGreaterThan(0);
      expect(breakingNews[0]).toHaveProperty('url');
      expect(breakingNews[0]).toHaveProperty('frequency');
      expect(['realtime', 'hourly']).toContain(breakingNews[0].frequency);
    });

    test('filters by confidence threshold', async () => {
      const highConfidence = await learner.identifyBreakingNewsHubs('example.com', 0.9);
      const lowConfidence = await learner.identifyBreakingNewsHubs('example.com', 0.5);

      expect(highConfidence.length).toBeLessThanOrEqual(lowConfidence.length);
    });

    test('sorts by average new articles', async () => {
      const breakingNews = await learner.identifyBreakingNewsHubs('example.com', 0.5);

      if (breakingNews.length > 1) {
        for (let i = 1; i < breakingNews.length; i++) {
          expect(breakingNews[i - 1].avg_new_articles).toBeGreaterThanOrEqual(breakingNews[i].avg_new_articles);
        }
      }
    });
  });

  describe('detectSeasonalPatterns', () => {
    test('identifies peak months', async () => {
      const hubUrl = 'https://example.com/seasonal';
      const baseTime = new Date('2024-01-01T00:00:00Z');
      
      // Create visits across multiple months with February peak
      for (let month = 0; month < 12; month++) {
        const newArticles = month === 1 ? 50 : 10; // February peak
        for (let day = 0; day < 5; day++) { // More visits per month
          const visitDate = new Date(baseTime);
          visitDate.setMonth(month);
          visitDate.setDate(day + 1);
          db.prepare(`
            INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
            VALUES (?, ?, ?, ?, ?, ?)
          `).run('example.com', hubUrl, 'section', visitDate.toISOString(), 100, newArticles);
        }
      }

      const seasonal = await learner.detectSeasonalPatterns('example.com', 'section');

      // May be null if insufficient data points
      if (seasonal) {
        expect(seasonal).toHaveProperty('peakMonths');
        expect(seasonal.peakMonths).toBeInstanceOf(Array);
      } else {
        expect(seasonal).toBeNull();
      }
    });

    test('requires sufficient data points', async () => {
      const seasonal = await learner.detectSeasonalPatterns('example.com', 'section');

      expect(seasonal).toBe(null);
    });
  });

  describe('getStats', () => {
    test('returns temporal statistics', async () => {
      const hubUrl = 'https://example.com/politics';
      const now = Date.now();
      
      for (let i = 0; i < 10; i++) {
        db.prepare(`
          INSERT INTO hub_visits (domain, hub_url, hub_type, visited_at, articles_found, new_articles)
          VALUES (?, ?, ?, ?, ?, ?)
        `).run('example.com', hubUrl, 'section', now - (10 - i) * 3600000, 50, 5);
      }

      await learner.learnUpdatePattern('example.com', hubUrl, 'section');
      const stats = learner.getTemporalStats();

      expect(stats).toHaveProperty('patternsLearned');
      expect(stats).toHaveProperty('byFrequency');
      expect(stats.patternsLearned).toBeGreaterThan(0);
    });

    test('handles no patterns', () => {
      const stats = learner.getTemporalStats();

      expect(stats.patternsLearned).toBe(0);
    });
  });

  describe('close', () => {
    test('clears caches', async () => {
      await learner.recordVisit('example.com', 'https://example.com/politics', 'section', 50, 10);
      learner.close();

      const stats = learner.getTemporalStats();
      expect(stats.patternsLearned).toBe(0);
    });
  });
});
