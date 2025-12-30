'use strict';

/**
 * Analytics Hub Tests
 * 
 * Tests for the Historical Analytics Dashboard at port 3101
 */

const path = require('path');
const Database = require('better-sqlite3');
const request = require('supertest');

const { AnalyticsService } = require('../../../src/ui/server/analyticsHub/AnalyticsService');
const { createApp, initDb } = require('../../../src/ui/server/analyticsHub/server');

// ─────────────────────────────────────────────────────────────
// Test fixtures
// ─────────────────────────────────────────────────────────────

/**
 * Create an in-memory test database with sample data
 */
function createTestDb() {
  const db = new Database(':memory:');

  // Create minimal schema for http_responses and urls
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      host TEXT NOT NULL
    );

    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      request_started_at TEXT NOT NULL,
      fetched_at TEXT,
      http_status INTEGER,
      content_type TEXT
    );

    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER REFERENCES http_responses(id),
      body_text TEXT
    );

    CREATE TABLE content_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER REFERENCES content_storage(id),
      classification TEXT,
      confidence_score REAL,
      analyzed_at TEXT
    );

    CREATE INDEX idx_http_responses_fetched ON http_responses(fetched_at);
  `);

  return db;
}

/**
 * Seed test data into database
 */
function seedTestData(db) {
  const domains = ['example.com', 'news.org', 'tech.io', 'sports.net', 'blog.dev'];
  const now = new Date();

  // Insert URLs
  const insertUrl = db.prepare('INSERT INTO urls (url, host) VALUES (?, ?)');
  for (let i = 0; i < 100; i++) {
    const host = domains[i % domains.length];
    insertUrl.run(`https://${host}/article/${i}`, host);
  }

  // Insert http_responses with varied timestamps
  const insertResponse = db.prepare(
    'INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type) VALUES (?, ?, ?, ?, ?)'
  );

  for (let i = 1; i <= 100; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const hoursAgo = Math.floor(Math.random() * 24);
    const fetchDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);
    const httpStatus = Math.random() > 0.1 ? 200 : (Math.random() > 0.5 ? 404 : 500);

    insertResponse.run(
      i,
      fetchDate.toISOString(),
      fetchDate.toISOString(),
      httpStatus,
      'text/html'
    );
  }

  // Insert content_storage
  const insertStorage = db.prepare('INSERT INTO content_storage (http_response_id, body_text) VALUES (?, ?)');
  for (let i = 1; i <= 50; i++) {
    insertStorage.run(i, `Article body text ${i}`);
  }

  // Insert content_analysis with classifications
  const insertAnalysis = db.prepare(
    'INSERT INTO content_analysis (content_id, classification, confidence_score, analyzed_at) VALUES (?, ?, ?, ?)'
  );
  const classifications = ['Politics', 'Technology', 'Sports', 'Business', 'Entertainment'];
  for (let i = 1; i <= 50; i++) {
    const classification = classifications[i % classifications.length];
    const confidence = 0.5 + Math.random() * 0.5;
    insertAnalysis.run(i, classification, confidence, now.toISOString());
  }
}

// ─────────────────────────────────────────────────────────────
// AnalyticsService Tests
// ─────────────────────────────────────────────────────────────

describe('AnalyticsService', () => {
  let db;
  let service;

  beforeAll(() => {
    db = createTestDb();
    seedTestData(db);
    service = new AnalyticsService(db);
  });

  afterAll(() => {
    db.close();
  });

  describe('getArticleCountsByDate', () => {
    it('returns array of daily counts', () => {
      const counts = service.getArticleCountsByDate('30d');
      
      expect(Array.isArray(counts)).toBe(true);
      expect(counts.length).toBeGreaterThan(0);
    });

    it('each count has day and count properties', () => {
      const counts = service.getArticleCountsByDate('7d');
      
      if (counts.length > 0) {
        expect(counts[0]).toHaveProperty('day');
        expect(counts[0]).toHaveProperty('count');
        expect(typeof counts[0].day).toBe('string');
        expect(typeof counts[0].count).toBe('number');
      }
    });

    it('returns counts sorted by day', () => {
      const counts = service.getArticleCountsByDate('30d');
      
      for (let i = 1; i < counts.length; i++) {
        expect(counts[i].day >= counts[i - 1].day).toBe(true);
      }
    });
  });

  describe('getDomainLeaderboard', () => {
    it('returns array of domain leaders', () => {
      const leaders = service.getDomainLeaderboard(50, '30d');
      
      expect(Array.isArray(leaders)).toBe(true);
      expect(leaders.length).toBeGreaterThan(0);
    });

    it('leaders have required properties', () => {
      const leaders = service.getDomainLeaderboard(10, '30d');
      
      if (leaders.length > 0) {
        expect(leaders[0]).toHaveProperty('rank');
        expect(leaders[0]).toHaveProperty('host');
        expect(leaders[0]).toHaveProperty('articleCount');
        expect(leaders[0]).toHaveProperty('avgPerDay');
        expect(leaders[0]).toHaveProperty('lastCrawled');
      }
    });

    it('respects limit parameter', () => {
      const leaders5 = service.getDomainLeaderboard(5, '30d');
      const leaders10 = service.getDomainLeaderboard(10, '30d');
      
      expect(leaders5.length).toBeLessThanOrEqual(5);
      expect(leaders10.length).toBeLessThanOrEqual(10);
    });

    it('ranks are assigned correctly', () => {
      const leaders = service.getDomainLeaderboard(10, '30d');
      
      for (let i = 0; i < leaders.length; i++) {
        expect(leaders[i].rank).toBe(i + 1);
      }
    });

    it('sorts by article count descending', () => {
      const leaders = service.getDomainLeaderboard(50, '30d');
      
      for (let i = 1; i < leaders.length; i++) {
        expect(leaders[i].articleCount).toBeLessThanOrEqual(leaders[i - 1].articleCount);
      }
    });
  });

  describe('getHourlyActivity', () => {
    it('returns 168 cells (7 days × 24 hours)', () => {
      const activity = service.getHourlyActivity('7d');
      
      expect(activity.length).toBe(168);
    });

    it('each cell has hour, dow, and count properties', () => {
      const activity = service.getHourlyActivity('7d');
      
      for (const cell of activity) {
        expect(cell).toHaveProperty('hour');
        expect(cell).toHaveProperty('dow');
        expect(cell).toHaveProperty('count');
        expect(cell.hour).toBeGreaterThanOrEqual(0);
        expect(cell.hour).toBeLessThan(24);
        expect(cell.dow).toBeGreaterThanOrEqual(0);
        expect(cell.dow).toBeLessThan(7);
        expect(typeof cell.count).toBe('number');
      }
    });

    it('covers all hour/day combinations', () => {
      const activity = service.getHourlyActivity('7d');
      const seen = new Set();
      
      for (const cell of activity) {
        seen.add(`${cell.dow}-${cell.hour}`);
      }
      
      expect(seen.size).toBe(168);
    });
  });

  describe('getCategoryBreakdown', () => {
    it('returns array of category counts', () => {
      const categories = service.getCategoryBreakdown('30d');
      
      expect(Array.isArray(categories)).toBe(true);
    });

    it('each category has name, count, and percent', () => {
      const categories = service.getCategoryBreakdown('30d');
      
      if (categories.length > 0) {
        expect(categories[0]).toHaveProperty('category');
        expect(categories[0]).toHaveProperty('count');
        expect(categories[0]).toHaveProperty('percent');
      }
    });
  });

  describe('getExtractionSuccessRate', () => {
    it('returns success rate metrics', () => {
      const rate = service.getExtractionSuccessRate('7d');
      
      expect(rate).toHaveProperty('total');
      expect(rate).toHaveProperty('success');
      expect(rate).toHaveProperty('clientError');
      expect(rate).toHaveProperty('serverError');
      expect(rate).toHaveProperty('successRate');
    });

    it('successRate is between 0 and 100', () => {
      const rate = service.getExtractionSuccessRate('7d');
      
      expect(rate.successRate).toBeGreaterThanOrEqual(0);
      expect(rate.successRate).toBeLessThanOrEqual(100);
    });
  });

  describe('getOverallStats', () => {
    it('returns overall statistics', () => {
      const stats = service.getOverallStats();
      
      expect(stats).toHaveProperty('totalResponses');
      expect(stats).toHaveProperty('uniqueUrls');
      expect(stats).toHaveProperty('totalDomains');
      expect(stats).toHaveProperty('dateRange');
    });

    it('counts match expected values', () => {
      const stats = service.getOverallStats();
      
      expect(stats.totalResponses).toBe(100);
      expect(stats.uniqueUrls).toBe(100);
      expect(stats.totalDomains).toBe(5);
    });
  });

  describe('caching', () => {
    it('caches results for performance', () => {
      // First call
      const start1 = Date.now();
      service.getArticleCountsByDate('30d');
      const time1 = Date.now() - start1;

      // Second call (should be cached)
      const start2 = Date.now();
      service.getArticleCountsByDate('30d');
      const time2 = Date.now() - start2;

      // Cached call should be faster or equal
      expect(time2).toBeLessThanOrEqual(time1 + 5); // Allow small variance
    });

    it('clearCache invalidates cache', () => {
      service.getArticleCountsByDate('30d');
      service.clearCache();
      
      // After clearing, cache should be empty
      expect(service._cache.size).toBe(0);
    });
  });
});

// ─────────────────────────────────────────────────────────────
// API Endpoint Tests
// ─────────────────────────────────────────────────────────────

describe('Analytics Hub API', () => {
  let db;
  let service;
  let app;

  beforeAll(() => {
    db = createTestDb();
    seedTestData(db);
    service = new AnalyticsService(db);
    app = createApp(service);
  });

  afterAll(() => {
    db.close();
  });

  describe('GET /api/analytics/trends', () => {
    it('returns trends data', async () => {
      const res = await request(app)
        .get('/api/analytics/trends')
        .query({ period: '30d' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.period).toBe('30d');
    });

    it('respects period parameter', async () => {
      const res7d = await request(app).get('/api/analytics/trends?period=7d');
      const res30d = await request(app).get('/api/analytics/trends?period=30d');

      expect(res7d.body.period).toBe('7d');
      expect(res30d.body.period).toBe('30d');
    });
  });

  describe('GET /api/analytics/leaderboard', () => {
    it('returns leaderboard data', async () => {
      const res = await request(app)
        .get('/api/analytics/leaderboard')
        .query({ limit: 10, period: '30d' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeLessThanOrEqual(10);
    });

    it('respects limit parameter', async () => {
      const res5 = await request(app).get('/api/analytics/leaderboard?limit=5');
      const res10 = await request(app).get('/api/analytics/leaderboard?limit=10');

      expect(res5.body.data.length).toBeLessThanOrEqual(5);
      expect(res10.body.data.length).toBeLessThanOrEqual(10);
    });
  });

  describe('GET /api/analytics/heatmap', () => {
    it('returns 168 cells', async () => {
      const res = await request(app)
        .get('/api/analytics/heatmap')
        .query({ period: '7d' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(168);
    });
  });

  describe('GET /api/analytics/success-rate', () => {
    it('returns success rate metrics', async () => {
      const res = await request(app)
        .get('/api/analytics/success-rate')
        .query({ period: '7d' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('successRate');
    });
  });

  describe('GET /api/analytics/summary', () => {
    it('returns overall stats', async () => {
      const res = await request(app).get('/api/analytics/summary');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('totalResponses');
      expect(res.body.data).toHaveProperty('totalDomains');
    });
  });
});

// ─────────────────────────────────────────────────────────────
// SSR Page Tests
// ─────────────────────────────────────────────────────────────

describe('Analytics Hub Pages', () => {
  let db;
  let service;
  let app;

  beforeAll(() => {
    db = createTestDb();
    seedTestData(db);
    service = new AnalyticsService(db);
    app = createApp(service);
  });

  afterAll(() => {
    db.close();
  });

  describe('GET /', () => {
    it('returns HTML page', async () => {
      const res = await request(app).get('/');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
    });

    it('includes dashboard title', async () => {
      const res = await request(app).get('/');

      expect(res.text).toContain('Historical Analytics');
    });

    it('includes period selector', async () => {
      const res = await request(app).get('/');

      expect(res.text).toContain('7 Days');
      expect(res.text).toContain('30 Days');
      expect(res.text).toContain('90 Days');
    });

    it('respects period query parameter', async () => {
      const res7d = await request(app).get('/?period=7d');
      const res90d = await request(app).get('/?period=90d');

      expect(res7d.text).toContain('period-selector__btn--active');
      expect(res90d.text).toContain('period-selector__btn--active');
    });
  });

  describe('GET /leaderboard', () => {
    it('returns leaderboard page', async () => {
      const res = await request(app).get('/leaderboard');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toMatch(/html/);
      expect(res.text).toContain('Domain Leaderboard');
    });

    it('includes sortable headers', async () => {
      const res = await request(app).get('/leaderboard');

      expect(res.text).toContain('sort=');
    });
  });
});
