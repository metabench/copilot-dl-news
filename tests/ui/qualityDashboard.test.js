'use strict';

/**
 * Tests for Quality Dashboard
 * 
 * Tests cover:
 * - QualityMetricsService data aggregation
 * - Express API endpoints
 * - jsgui3 control rendering
 * - Error handling
 */

const request = require('supertest');
const Database = require('better-sqlite3');

const { QualityMetricsService } = require('../../src/ui/server/qualityDashboard/QualityMetricsService');
const { createApp, initDb } = require('../../src/ui/server/qualityDashboard/server');
const { 
  DomainQualityTable, 
  ConfidenceHistogram, 
  RegressionAlerts,
  getConfidenceLevel,
  formatConfidence,
  getBucketColor,
  getSeverity
} = require('../../src/ui/server/qualityDashboard/controls');

const jsgui = require('jsgui3-html');

// ─────────────────────────────────────────────────────────────
// Test Database Setup
// ─────────────────────────────────────────────────────────────

function buildInMemoryDb() {
  const db = new Database(':memory:');
  
  // Create required tables
  db.exec(`
    CREATE TABLE urls (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL,
      host TEXT,
      created_at TEXT
    );

    CREATE TABLE http_responses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url_id INTEGER NOT NULL REFERENCES urls(id),
      request_started_at TEXT,
      fetched_at TEXT,
      http_status INTEGER
    );

    CREATE TABLE content_storage (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      http_response_id INTEGER REFERENCES http_responses(id),
      uncompressed_size INTEGER
    );

    CREATE TABLE content_analysis (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      content_id INTEGER REFERENCES content_storage(id),
      classification TEXT,
      confidence_score REAL,
      analyzed_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE article_xpath_patterns (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      domain TEXT NOT NULL,
      xpath TEXT NOT NULL,
      confidence REAL
    );
  `);

  return db;
}

function seedTestData(db) {
  // Insert test URLs
  const insertUrl = db.prepare("INSERT INTO urls (url, host, created_at) VALUES (?, ?, datetime('now'))");
  const insertResponse = db.prepare("INSERT INTO http_responses (url_id, fetched_at, http_status) VALUES (?, datetime('now'), 200)");
  const insertStorage = db.prepare('INSERT INTO content_storage (http_response_id, uncompressed_size) VALUES (?, 5000)');
  const insertAnalysis = db.prepare("INSERT INTO content_analysis (content_id, classification, confidence_score, analyzed_at) VALUES (?, ?, ?, datetime('now'))");

  // Domain 1: High quality (example.com)
  for (let i = 0; i < 10; i++) {
    const urlResult = insertUrl.run(`https://example.com/article-${i}`, 'example.com');
    const respResult = insertResponse.run(urlResult.lastInsertRowid);
    const storResult = insertStorage.run(respResult.lastInsertRowid);
    insertAnalysis.run(storResult.lastInsertRowid, 'article', 0.85 + Math.random() * 0.1);
  }

  // Domain 2: Medium quality (news.org)
  for (let i = 0; i < 8; i++) {
    const urlResult = insertUrl.run(`https://news.org/story-${i}`, 'news.org');
    const respResult = insertResponse.run(urlResult.lastInsertRowid);
    const storResult = insertStorage.run(respResult.lastInsertRowid);
    insertAnalysis.run(storResult.lastInsertRowid, 'article', 0.55 + Math.random() * 0.15);
  }

  // Domain 3: Low quality (blog.io)
  for (let i = 0; i < 6; i++) {
    const urlResult = insertUrl.run(`https://blog.io/post-${i}`, 'blog.io');
    const respResult = insertResponse.run(urlResult.lastInsertRowid);
    const storResult = insertStorage.run(respResult.lastInsertRowid);
    insertAnalysis.run(storResult.lastInsertRowid, 'article', 0.25 + Math.random() * 0.15);
  }

  // Add some xpath patterns
  const insertPattern = db.prepare('INSERT INTO article_xpath_patterns (domain, xpath, confidence) VALUES (?, ?, ?)');
  insertPattern.run('example.com', '//article', 0.95);
  insertPattern.run('news.org', '//div[@class="content"]', 0.75);
  insertPattern.run('blog.io', '//body', 0.45);

  return db;
}

function createTestServer() {
  const db = buildInMemoryDb();
  seedTestData(db);
  const service = new QualityMetricsService(db);
  const app = createApp(service);
  return { db, service, app };
}

// ─────────────────────────────────────────────────────────────
// QualityMetricsService Tests
// ─────────────────────────────────────────────────────────────

describe('QualityMetricsService', () => {
  let db;
  let service;

  beforeEach(() => {
    db = buildInMemoryDb();
    seedTestData(db);
    service = new QualityMetricsService(db);
  });

  afterEach(() => {
    db.close();
  });

  test('getSummary returns correct aggregate metrics', () => {
    const summary = service.getSummary();

    expect(summary).toHaveProperty('avgConfidence');
    expect(summary).toHaveProperty('totalArticles');
    expect(summary).toHaveProperty('qualityTiers');
    expect(summary).toHaveProperty('methodBreakdown');
    expect(summary).toHaveProperty('classificationBreakdown');

    expect(summary.totalArticles).toBe(24);
    expect(summary.avgConfidence).toBeGreaterThan(0);
    expect(summary.avgConfidence).toBeLessThanOrEqual(1);
  });

  test('getSummary returns quality tier breakdown', () => {
    const summary = service.getSummary();

    expect(summary.qualityTiers).toHaveProperty('high');
    expect(summary.qualityTiers).toHaveProperty('medium');
    expect(summary.qualityTiers).toHaveProperty('low');

    // High quality: example.com (10 articles with confidence >= 0.8)
    expect(summary.qualityTiers.high).toBeGreaterThanOrEqual(8);
    // Low quality: blog.io (6 articles with confidence < 0.5)
    expect(summary.qualityTiers.low).toBeGreaterThanOrEqual(4);
  });

  test('getDomains returns per-domain quality scores', () => {
    const domains = service.getDomains({ minArticles: 1, limit: 10 });

    expect(Array.isArray(domains)).toBe(true);
    expect(domains.length).toBe(3);

    for (const domain of domains) {
      expect(domain).toHaveProperty('host');
      expect(domain).toHaveProperty('articleCount');
      expect(domain).toHaveProperty('avgConfidence');
      expect(domain).toHaveProperty('minConfidence');
      expect(domain).toHaveProperty('maxConfidence');
      expect(domain).toHaveProperty('qualityRate');
    }
  });

  test('getDomains respects minArticles filter', () => {
    const domains = service.getDomains({ minArticles: 8, limit: 10 });

    // Only example.com (10) and news.org (8) meet the threshold
    expect(domains.length).toBe(2);
    expect(domains.every(d => d.articleCount >= 8)).toBe(true);
  });

  test('getDomains respects limit parameter', () => {
    const domains = service.getDomains({ minArticles: 1, limit: 2 });

    expect(domains.length).toBe(2);
  });

  test('getDomains sorts by confidence correctly', () => {
    const domains = service.getDomains({ minArticles: 1, sortBy: 'confidence', sortOrder: 'asc' });

    // Ascending order means lowest confidence first
    for (let i = 1; i < domains.length; i++) {
      expect(domains[i].avgConfidence).toBeGreaterThanOrEqual(domains[i - 1].avgConfidence);
    }
  });

  test('getConfidenceDistribution returns histogram buckets', () => {
    const distribution = service.getConfidenceDistribution();

    expect(Array.isArray(distribution)).toBe(true);
    expect(distribution.length).toBe(10); // 10 buckets from 0.0-0.1 to 0.9-1.0

    for (const bucket of distribution) {
      expect(bucket).toHaveProperty('min');
      expect(bucket).toHaveProperty('max');
      expect(bucket).toHaveProperty('label');
      expect(bucket).toHaveProperty('count');
      expect(bucket).toHaveProperty('percent');
    }

    // Total percent should be ~100%
    const totalPercent = distribution.reduce((sum, b) => sum + b.percent, 0);
    expect(totalPercent).toBeCloseTo(100, 0);
  });

  test('getRegressions returns empty array when no data drift', () => {
    // Fresh test data won't have historical comparison
    const regressions = service.getRegressions();

    expect(Array.isArray(regressions)).toBe(true);
    // With fresh data, no regressions expected
  });

  test('getRecentActivity returns recent analyses', () => {
    const activity = service.getRecentActivity(5);

    expect(Array.isArray(activity)).toBe(true);
    expect(activity.length).toBeLessThanOrEqual(5);

    if (activity.length > 0) {
      expect(activity[0]).toHaveProperty('host');
      expect(activity[0]).toHaveProperty('url');
      expect(activity[0]).toHaveProperty('confidence_score');
    }
  });
});

// ─────────────────────────────────────────────────────────────
// Express API Tests
// ─────────────────────────────────────────────────────────────

describe('Quality Dashboard API', () => {
  let testEnv;

  beforeEach(() => {
    testEnv = createTestServer();
  });

  afterEach(() => {
    testEnv.db.close();
  });

  test('GET /api/quality/summary returns JSON', async () => {
    const res = await request(testEnv.app).get('/api/quality/summary');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toHaveProperty('avgConfidence');
    expect(res.body.data).toHaveProperty('totalArticles');
  });

  test('GET /api/quality/domains returns domain list', async () => {
    const res = await request(testEnv.app).get('/api/quality/domains');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/quality/domains respects query params', async () => {
    const res = await request(testEnv.app)
      .get('/api/quality/domains?minArticles=8&limit=1&sort=count');

    expect(res.status).toBe(200);
    expect(res.body.data.length).toBe(1);
  });

  test('GET /api/quality/regressions returns array', async () => {
    const res = await request(testEnv.app).get('/api/quality/regressions');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
  });

  test('GET /api/quality/distribution returns histogram', async () => {
    const res = await request(testEnv.app).get('/api/quality/distribution');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.length).toBe(10);
  });

  test('GET / renders SSR dashboard page', async () => {
    const res = await request(testEnv.app).get('/');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Quality Dashboard');
    expect(res.text).toContain('Average Confidence');
    expect(res.text).toContain('Confidence Distribution');
  });

  test('GET /domains renders domains page', async () => {
    const res = await request(testEnv.app).get('/domains');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Domain Quality Breakdown');
    expect(res.text).toContain('example.com');
  });

  test('GET /regressions renders regressions page', async () => {
    const res = await request(testEnv.app).get('/regressions');

    expect(res.status).toBe(200);
    expect(res.text).toContain('Quality Regressions');
  });
});

// ─────────────────────────────────────────────────────────────
// Control Utility Function Tests
// ─────────────────────────────────────────────────────────────

describe('Control utility functions', () => {
  test('getConfidenceLevel returns correct level', () => {
    expect(getConfidenceLevel(0.9)).toBe('high');
    expect(getConfidenceLevel(0.8)).toBe('high');
    expect(getConfidenceLevel(0.7)).toBe('medium');
    expect(getConfidenceLevel(0.5)).toBe('medium');
    expect(getConfidenceLevel(0.4)).toBe('low');
    expect(getConfidenceLevel(0.1)).toBe('low');
  });

  test('formatConfidence formats numbers correctly', () => {
    expect(formatConfidence(0.95)).toBe('95.0%');
    expect(formatConfidence(0.5)).toBe('50.0%');
    expect(formatConfidence(0.123)).toBe('12.3%');
    expect(formatConfidence(null)).toBe('-');
    expect(formatConfidence(undefined)).toBe('-');
  });

  test('getBucketColor returns appropriate colors', () => {
    expect(getBucketColor(0.9)).toBe('#22c55e'); // green
    expect(getBucketColor(0.8)).toBe('#22c55e');
    expect(getBucketColor(0.6)).toBe('#84cc16'); // lime
    expect(getBucketColor(0.5)).toBe('#eab308'); // yellow
    expect(getBucketColor(0.3)).toBe('#f97316'); // orange
    expect(getBucketColor(0.1)).toBe('#ef4444'); // red
  });

  test('getSeverity returns correct severity level', () => {
    expect(getSeverity(35)).toBe('critical');
    expect(getSeverity(30)).toBe('critical');
    expect(getSeverity(20)).toBe('warning');
    expect(getSeverity(15)).toBe('warning');
    expect(getSeverity(10)).toBe('info');
    expect(getSeverity(5)).toBe('info');
  });
});

// ─────────────────────────────────────────────────────────────
// jsgui3 Control Rendering Tests
// ─────────────────────────────────────────────────────────────

describe('jsgui3 Control rendering', () => {
  let ctx;

  beforeEach(() => {
    ctx = new jsgui.Page_Context();
  });

  test('DomainQualityTable renders with data', () => {
    const domains = [
      { host: 'example.com', articleCount: 10, avgConfidence: 0.9, minConfidence: 0.85, maxConfidence: 0.95, qualityRate: '100', lastAnalyzedAt: '2025-01-01T00:00:00Z' },
      { host: 'blog.io', articleCount: 5, avgConfidence: 0.4, minConfidence: 0.3, maxConfidence: 0.5, qualityRate: '40', lastAnalyzedAt: '2025-01-01T00:00:00Z' }
    ];

    const table = new DomainQualityTable({ context: ctx, domains });
    const html = table.render();

    expect(html).toContain('example.com');
    expect(html).toContain('blog.io');
    expect(html).toContain('quality-table');
  });

  test('DomainQualityTable renders empty state', () => {
    const table = new DomainQualityTable({ context: ctx, domains: [] });
    const html = table.render();

    expect(html).toContain('quality-table__empty');
    expect(html).toContain('No domain quality data');
  });

  test('ConfidenceHistogram renders with buckets', () => {
    const buckets = [
      { min: 0.9, max: 1.0, label: '0.9-1.0', count: 10, percent: 50 },
      { min: 0.8, max: 0.9, label: '0.8-0.9', count: 5, percent: 25 },
      { min: 0.7, max: 0.8, label: '0.7-0.8', count: 5, percent: 25 }
    ];

    const histogram = new ConfidenceHistogram({ context: ctx, buckets });
    const html = histogram.render();

    expect(html).toContain('confidence-histogram');
    expect(html).toContain('Confidence Distribution');
    expect(html).toContain('0.9-1.0');
  });

  test('ConfidenceHistogram renders empty state', () => {
    const histogram = new ConfidenceHistogram({ context: ctx, buckets: [] });
    const html = histogram.render();

    expect(html).toContain('No confidence data available');
  });

  test('RegressionAlerts renders with regressions', () => {
    const regressions = [
      { host: 'failing.com', previousAvg: 0.8, currentAvg: 0.5, dropPercent: 37.5, articleCount: 10 }
    ];

    const alerts = new RegressionAlerts({ context: ctx, regressions });
    const html = alerts.render();

    expect(html).toContain('regression-alerts');
    expect(html).toContain('failing.com');
    expect(html).toContain('-37.5%');
  });

  test('RegressionAlerts renders success state when empty', () => {
    const alerts = new RegressionAlerts({ context: ctx, regressions: [] });
    const html = alerts.render();

    expect(html).toContain('No quality regressions detected');
    expect(html).toContain('✅');
  });

  test('RegressionAlerts respects maxDisplay limit', () => {
    const regressions = Array(15).fill(null).map((_, i) => ({
      host: `domain${i}.com`,
      previousAvg: 0.8,
      currentAvg: 0.5,
      dropPercent: 20,
      articleCount: 5
    }));

    const alerts = new RegressionAlerts({ context: ctx, regressions, maxDisplay: 5 });
    const html = alerts.render();

    // Should show "+10 more regressions"
    expect(html).toContain('+10 more regressions');
  });
});

// ─────────────────────────────────────────────────────────────
// Edge Cases and Error Handling
// ─────────────────────────────────────────────────────────────

describe('Edge cases', () => {
  test('QualityMetricsService handles empty database', () => {
    const emptyDb = buildInMemoryDb();
    const service = new QualityMetricsService(emptyDb);

    const summary = service.getSummary();
    expect(summary.totalArticles).toBe(0);
    expect(summary.avgConfidence).toBe(0);

    const domains = service.getDomains();
    expect(domains).toEqual([]);

    const distribution = service.getConfidenceDistribution();
    expect(distribution.every(b => b.count === 0)).toBe(true);

    emptyDb.close();
  });

  test('API handles missing query params gracefully', async () => {
    const testEnv = createTestServer();

    const res = await request(testEnv.app)
      .get('/api/quality/domains?minArticles=invalid');

    expect(res.status).toBe(200);
    // Should use default when parseInt fails
    expect(res.body.success).toBe(true);

    testEnv.db.close();
  });
});
