'use strict';

/**
 * Analytics Dashboard Check Script
 * 
 * Quick validation script for the Historical Analytics Dashboard.
 * Tests core functionality without requiring the full test suite.
 * 
 * Usage:
 *   node checks/analytics-dashboard.check.js
 */

const path = require('path');
const assert = require('assert');

// ─────────────────────────────────────────────────────────────
// Test Database Setup
// ─────────────────────────────────────────────────────────────

const Database = require('better-sqlite3');

function createTestDb() {
  const db = new Database(':memory:');

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

  // Seed test data
  const domains = ['example.com', 'news.org', 'tech.io', 'sports.net', 'blog.dev'];
  const now = new Date();

  const insertUrl = db.prepare('INSERT INTO urls (url, host) VALUES (?, ?)');
  const insertResponse = db.prepare(
    'INSERT INTO http_responses (url_id, request_started_at, fetched_at, http_status, content_type) VALUES (?, ?, ?, ?, ?)'
  );

  for (let i = 0; i < 50; i++) {
    const host = domains[i % domains.length];
    insertUrl.run(`https://${host}/article/${i}`, host);

    const daysAgo = i % 30;
    const hoursAgo = i % 24;
    const fetchDate = new Date(now - daysAgo * 24 * 60 * 60 * 1000 - hoursAgo * 60 * 60 * 1000);

    insertResponse.run(
      i + 1,
      fetchDate.toISOString(),
      fetchDate.toISOString(),
      i % 10 === 0 ? 404 : 200,
      'text/html'
    );
  }

  return db;
}

// ─────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────

async function runChecks() {
  console.log('📊 Analytics Dashboard Check Script\n');

  const { AnalyticsService } = require('../src/ui/server/analyticsHub/AnalyticsService');
  const { 
    TrendChart, 
    DomainLeaderboard, 
    ActivityHeatmap, 
    PeriodSelector,
    SummaryCard 
  } = require('../src/ui/server/analyticsHub/controls');
  const jsgui = require('jsgui3-html');

  const db = createTestDb();
  const service = new AnalyticsService(db);
  const ctx = new jsgui.Page_Context();

  let passed = 0;
  let failed = 0;

  function check(name, fn) {
    try {
      fn();
      console.log(`  ✅ ${name}`);
      passed++;
    } catch (err) {
      console.log(`  ❌ ${name}: ${err.message}`);
      failed++;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // AnalyticsService Checks
  // ─────────────────────────────────────────────────────────────

  console.log('📈 AnalyticsService:');

  check('getArticleCountsByDate returns array', () => {
    const counts = service.getArticleCountsByDate('30d');
    assert(Array.isArray(counts), 'Expected array');
    assert(counts.length > 0, 'Expected non-empty array');
  });

  check('Daily counts have day and count properties', () => {
    const counts = service.getArticleCountsByDate('7d');
    assert(counts[0].day, 'Expected day property');
    assert(typeof counts[0].count === 'number', 'Expected count to be number');
  });

  check('getDomainLeaderboard returns ranked domains', () => {
    const leaders = service.getDomainLeaderboard(10, '30d');
    assert(Array.isArray(leaders), 'Expected array');
    assert(leaders.length > 0, 'Expected non-empty array');
    assert(leaders[0].rank === 1, 'First leader should have rank 1');
    assert(leaders[0].host, 'Leader should have host property');
    assert(typeof leaders[0].articleCount === 'number', 'Expected articleCount to be number');
  });

  check('Leaderboard respects limit', () => {
    const leaders5 = service.getDomainLeaderboard(3, '30d');
    assert(leaders5.length <= 3, 'Should respect limit');
  });

  check('Leaderboard sorted by article count descending', () => {
    const leaders = service.getDomainLeaderboard(50, '30d');
    for (let i = 1; i < leaders.length; i++) {
      assert(leaders[i].articleCount <= leaders[i-1].articleCount, 'Should be sorted descending');
    }
  });

  check('getHourlyActivity returns 168 cells (7×24)', () => {
    const activity = service.getHourlyActivity('7d');
    assert(activity.length === 168, `Expected 168 cells, got ${activity.length}`);
  });

  check('Heatmap cells have hour, dow, count', () => {
    const activity = service.getHourlyActivity('7d');
    const cell = activity[0];
    assert(typeof cell.hour === 'number', 'Expected hour to be number');
    assert(typeof cell.dow === 'number', 'Expected dow to be number');
    assert(typeof cell.count === 'number', 'Expected count to be number');
    assert(cell.hour >= 0 && cell.hour < 24, 'Hour should be 0-23');
    assert(cell.dow >= 0 && cell.dow < 7, 'DOW should be 0-6');
  });

  check('getExtractionSuccessRate returns metrics', () => {
    const rate = service.getExtractionSuccessRate('7d');
    assert(typeof rate.total === 'number', 'Expected total');
    assert(typeof rate.success === 'number', 'Expected success');
    assert(typeof rate.successRate === 'number', 'Expected successRate');
    assert(rate.successRate >= 0 && rate.successRate <= 100, 'Rate should be 0-100');
  });

  check('getOverallStats returns summary', () => {
    const stats = service.getOverallStats();
    assert(typeof stats.totalResponses === 'number', 'Expected totalResponses');
    assert(typeof stats.totalDomains === 'number', 'Expected totalDomains');
    assert(stats.totalResponses === 50, 'Expected 50 responses');
    assert(stats.totalDomains === 5, 'Expected 5 domains');
  });

  // ─────────────────────────────────────────────────────────────
  // Control Checks
  // ─────────────────────────────────────────────────────────────

  console.log('\n🎨 Controls:');

  check('TrendChart renders SVG', () => {
    const trends = service.getArticleCountsByDate('30d');
    const chart = new TrendChart({ context: ctx, data: trends });
    const html = chart.all_html_render();
    assert(html.includes('<svg'), 'Expected SVG element');
    assert(html.includes('trend-chart'), 'Expected trend-chart class');
  });

  check('TrendChart handles empty data', () => {
    const chart = new TrendChart({ context: ctx, data: [] });
    const html = chart.all_html_render();
    assert(html.includes('trend-chart__empty'), 'Expected empty state');
  });

  check('DomainLeaderboard renders table', () => {
    const leaders = service.getDomainLeaderboard(10, '30d');
    const table = new DomainLeaderboard({ context: ctx, domains: leaders });
    const html = table.all_html_render();
    assert(html.includes('<table'), 'Expected table element');
    assert(html.includes('analytics-table'), 'Expected analytics-table class');
    assert(html.includes('🏆'), 'Expected trophy emoji in title');
  });

  check('DomainLeaderboard shows medals for top 3', () => {
    const leaders = service.getDomainLeaderboard(10, '30d');
    const table = new DomainLeaderboard({ context: ctx, domains: leaders });
    const html = table.all_html_render();
    assert(html.includes('🥇'), 'Expected gold medal');
    assert(html.includes('🥈'), 'Expected silver medal');
    assert(html.includes('🥉'), 'Expected bronze medal');
  });

  check('ActivityHeatmap renders grid', () => {
    const activity = service.getHourlyActivity('7d');
    const heatmap = new ActivityHeatmap({ context: ctx, data: activity });
    const html = heatmap.all_html_render();
    assert(html.includes('activity-heatmap'), 'Expected heatmap class');
    assert(html.includes('activity-heatmap__cell'), 'Expected cell class');
    assert(html.includes('Mon'), 'Expected day label');
  });

  check('ActivityHeatmap shows legend', () => {
    const activity = service.getHourlyActivity('7d');
    const heatmap = new ActivityHeatmap({ context: ctx, data: activity });
    const html = heatmap.all_html_render();
    assert(html.includes('activity-heatmap__legend'), 'Expected legend');
    assert(html.includes('Peak'), 'Expected Peak label');
  });

  check('PeriodSelector renders buttons', () => {
    const selector = new PeriodSelector({ context: ctx, selected: '30d' });
    const html = selector.all_html_render();
    assert(html.includes('7 Days'), 'Expected 7 Days option');
    assert(html.includes('30 Days'), 'Expected 30 Days option');
    assert(html.includes('90 Days'), 'Expected 90 Days option');
    assert(html.includes('period-selector__btn--active'), 'Expected active button');
  });

  check('SummaryCard renders value and label', () => {
    const card = new SummaryCard({ 
      context: ctx, 
      icon: '📊', 
      value: '1,234', 
      label: 'Test Metric',
      variant: 'success'
    });
    const html = card.all_html_render();
    assert(html.includes('📊'), 'Expected icon');
    assert(html.includes('1,234'), 'Expected value');
    assert(html.includes('Test Metric'), 'Expected label');
    assert(html.includes('summary-card--success'), 'Expected success variant');
  });

  // ─────────────────────────────────────────────────────────────
  // Summary
  // ─────────────────────────────────────────────────────────────

  console.log(`\n${'─'.repeat(50)}`);
  console.log(`Total: ${passed + failed} checks`);
  console.log(`  ✅ Passed: ${passed}`);
  console.log(`  ❌ Failed: ${failed}`);

  db.close();

  if (failed > 0) {
    console.log('\n⚠️  Some checks failed!');
    process.exit(1);
  } else {
    console.log('\n🎉 All checks passed!');
    process.exit(0);
  }
}

runChecks().catch(err => {
  console.error('Check script error:', err);
  process.exit(1);
});
