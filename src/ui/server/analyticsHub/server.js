'use strict';

/**
 * Historical Analytics Dashboard Server
 * 
 * Express server at port 3101 providing:
 * - GET / - Main dashboard with trends, heatmap, leaderboard
 * - GET /api/analytics/trends - Time-series article counts
 * - GET /api/analytics/leaderboard - Top domains
 * - GET /api/analytics/heatmap - Hourly activity grid
 * - GET /api/analytics/categories - Category breakdown
 * - GET /api/analytics/success-rate - Extraction success rate
 * 
 * Usage:
 *   node src/ui/server/analyticsHub/server.js
 *   Open http://localhost:3101
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { wrapServerForCheck } = require('../utils/serverStartupCheck');

const { AnalyticsService } = require('./AnalyticsService');
const { 
  TrendChart, 
  DomainLeaderboard, 
  ActivityHeatmap, 
  PeriodSelector,
  SummaryCard 
} = require('./controls');

const PORT = process.env.ANALYTICS_PORT || 3101;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

// ─────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────

let db;
let analyticsService;

function initDb(dbPath = DB_PATH) {
  db = new Database(dbPath, { readonly: true });
  analyticsService = new AnalyticsService(db);
  return { db, analyticsService };
}

// ─────────────────────────────────────────────────────────────
// CSS Styles
// ─────────────────────────────────────────────────────────────

const DASHBOARD_CSS = `
  :root {
    --bg-primary: #0f172a;
    --bg-secondary: #1e293b;
    --bg-card: #334155;
    --text-primary: #f8fafc;
    --text-secondary: #94a3b8;
    --border-color: #475569;
    --accent-green: #22c55e;
    --accent-yellow: #eab308;
    --accent-red: #ef4444;
    --accent-blue: #3b82f6;
  }

  * { box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
    background: var(--bg-primary);
    color: var(--text-primary);
    line-height: 1.6;
  }

  a { color: var(--accent-blue); text-decoration: none; }
  a:hover { text-decoration: underline; }

  /* Header */
  .analytics-dashboard__header {
    background: var(--bg-secondary);
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  .analytics-dashboard__title {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 600;
  }

  .analytics-dashboard__subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
  }

  /* Main content */
  .analytics-dashboard__main {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  /* Period selector */
  .period-selector {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 24px;
    background: var(--bg-secondary);
    padding: 12px 16px;
    border-radius: 8px;
    border: 1px solid var(--border-color);
  }

  .period-selector__label {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .period-selector__group {
    display: flex;
    gap: 4px;
  }

  .period-selector__btn {
    padding: 6px 14px;
    border-radius: 4px;
    background: var(--bg-card);
    color: var(--text-secondary);
    font-size: 13px;
    text-decoration: none;
    transition: all 0.2s;
  }

  .period-selector__btn:hover {
    background: var(--accent-blue);
    color: var(--text-primary);
    text-decoration: none;
  }

  .period-selector__btn--active {
    background: var(--accent-blue);
    color: var(--text-primary);
  }

  /* Summary cards */
  .analytics-dashboard__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
    gap: 16px;
    margin-bottom: 32px;
  }

  .summary-card {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 20px;
    border: 1px solid var(--border-color);
  }

  .summary-card__icon {
    font-size: 24px;
    margin-bottom: 8px;
  }

  .summary-card__value {
    font-size: 28px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .summary-card__label {
    color: var(--text-secondary);
    font-size: 13px;
  }

  .summary-card--success .summary-card__value { color: var(--accent-green); }
  .summary-card--warning .summary-card__value { color: var(--accent-yellow); }
  .summary-card--danger .summary-card__value { color: var(--accent-red); }

  /* Sections */
  .analytics-dashboard__section {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid var(--border-color);
  }

  /* Trend chart */
  .trend-chart__title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .trend-chart__container {
    overflow-x: auto;
  }

  .trend-chart__svg {
    display: block;
    max-width: 100%;
    border-radius: 4px;
  }

  .trend-chart__summary {
    display: flex;
    gap: 24px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
    flex-wrap: wrap;
  }

  .trend-chart__stat {
    font-size: 13px;
    color: var(--text-secondary);
  }

  .trend-chart__empty {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  /* Domain leaderboard */
  .domain-leaderboard__title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .domain-leaderboard__empty {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  .analytics-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .analytics-table__header {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
  }

  .analytics-table__sort-link {
    color: var(--text-primary);
    text-decoration: none;
  }

  .analytics-table__sort-link:hover {
    color: var(--accent-blue);
  }

  .analytics-table tbody tr {
    border-bottom: 1px solid var(--border-color);
  }

  .analytics-table tbody tr:hover {
    background: var(--bg-card);
  }

  .analytics-table td {
    padding: 12px 16px;
  }

  .analytics-table__row--top {
    background: rgba(59, 130, 246, 0.05);
  }

  .analytics-table__cell--rank {
    width: 50px;
    text-align: center;
    font-size: 16px;
  }

  .analytics-table__cell--count {
    font-weight: 600;
    color: var(--accent-blue);
  }

  /* Activity heatmap */
  .activity-heatmap__title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .activity-heatmap__grid {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin-bottom: 16px;
  }

  .activity-heatmap__header-row,
  .activity-heatmap__data-row {
    display: flex;
    gap: 2px;
  }

  .activity-heatmap__day-label {
    width: 40px;
    font-size: 11px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: flex-end;
    padding-right: 8px;
  }

  .activity-heatmap__hour-label {
    width: 20px;
    height: 16px;
    font-size: 9px;
    color: var(--text-secondary);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .activity-heatmap__cell {
    width: 20px;
    height: 20px;
    border-radius: 2px;
    cursor: default;
    transition: transform 0.1s;
  }

  .activity-heatmap__cell:hover {
    transform: scale(1.2);
    z-index: 1;
  }

  .activity-heatmap__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .activity-heatmap__legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .activity-heatmap__swatch {
    width: 14px;
    height: 14px;
    border-radius: 2px;
  }

  .activity-heatmap__peaks {
    margin-top: 12px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .activity-heatmap__peaks-label {
    font-weight: 600;
  }

  .activity-heatmap__empty {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  /* Grid layout */
  .analytics-dashboard__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  .analytics-dashboard__grid--full {
    grid-template-columns: 1fr;
  }

  @media (max-width: 1024px) {
    .analytics-dashboard__grid {
      grid-template-columns: 1fr;
    }
  }

  /* Footer */
  .analytics-dashboard__footer {
    padding: 16px 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
    border-top: 1px solid var(--border-color);
  }
`;

// ─────────────────────────────────────────────────────────────
// jsgui3 String Control
// ─────────────────────────────────────────────────────────────

const StringControl = jsgui.String_Control;

// ─────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────

function renderPage(title, content) {
  const ctx = new jsgui.Page_Context();
  const page = new jsgui.Standard_Web_Page({ context: ctx });
  
  const titleEl = new jsgui.Control({ context: ctx, tagName: 'title' });
  titleEl.add(new StringControl({ context: ctx, text: title }));
  page.head.add(titleEl);

  const metaViewport = new jsgui.Control({ context: ctx, tagName: 'meta' });
  metaViewport.dom.attributes.name = 'viewport';
  metaViewport.dom.attributes.content = 'width=device-width, initial-scale=1';
  page.head.add(metaViewport);

  const style = new jsgui.Control({ context: ctx, tagName: 'style' });
  style.add(new StringControl({ context: ctx, text: DASHBOARD_CSS }));
  page.head.add(style);

  // Header
  const header = new jsgui.Control({ context: ctx, tagName: 'header' });
  header.add_class('analytics-dashboard__header');
  
  const h1 = new jsgui.Control({ context: ctx, tagName: 'h1' });
  h1.add_class('analytics-dashboard__title');
  h1.add(new StringControl({ context: ctx, text: '📊 Historical Analytics' }));
  header.add(h1);

  const subtitle = new jsgui.Control({ context: ctx, tagName: 'p' });
  subtitle.add_class('analytics-dashboard__subtitle');
  subtitle.add(new StringControl({ context: ctx, text: 'Aggregate view of crawl history with trends, patterns, and insights' }));
  header.add(subtitle);

  page.body.add(header);

  // Main content
  const main = new jsgui.Control({ context: ctx, tagName: 'main' });
  main.add_class('analytics-dashboard__main');
  main.dom.attributes.role = 'main';
  main.add(content);
  page.body.add(main);

  // Footer
  const footer = new jsgui.Control({ context: ctx, tagName: 'footer' });
  footer.add_class('analytics-dashboard__footer');
  footer.add(new StringControl({ 
    context: ctx, 
    text: `Generated at ${new Date().toISOString()} • Database: ${path.basename(DB_PATH)}` 
  }));
  page.body.add(footer);

  return page.all_html_render();
}

function renderDashboard(ctx, period, trends, leaderboard, heatmap, stats, successRate) {
  const container = new jsgui.Control({ context: ctx, tagName: 'div' });

  // Period selector
  container.add(new PeriodSelector({ 
    context: ctx, 
    selected: period,
    baseUrl: '/'
  }));

  // Summary cards
  const summaryGrid = new jsgui.Control({ context: ctx, tagName: 'div' });
  summaryGrid.add_class('analytics-dashboard__summary');

  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '📰',
    value: stats.totalResponses?.toLocaleString() || '0',
    label: 'Total Articles'
  }));

  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '🌐',
    value: stats.totalDomains?.toLocaleString() || '0',
    label: 'Domains Crawled'
  }));

  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '🔗',
    value: stats.uniqueUrls?.toLocaleString() || '0',
    label: 'Unique URLs'
  }));

  const successVariant = successRate.successRate >= 95 ? 'success' 
    : successRate.successRate >= 80 ? 'warning' 
    : 'danger';
  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '✅',
    value: `${successRate.successRate}%`,
    label: 'Success Rate',
    variant: successVariant
  }));

  container.add(summaryGrid);

  // Trend chart (full width)
  const trendSection = new jsgui.Control({ context: ctx, tagName: 'div' });
  trendSection.add_class('analytics-dashboard__section');
  trendSection.add(new TrendChart({ 
    context: ctx, 
    data: trends,
    title: `Article Trends (${period})`
  }));
  container.add(trendSection);

  // Two-column grid: Heatmap + Leaderboard
  const grid = new jsgui.Control({ context: ctx, tagName: 'div' });
  grid.add_class('analytics-dashboard__grid');

  // Heatmap
  const heatmapSection = new jsgui.Control({ context: ctx, tagName: 'div' });
  heatmapSection.add_class('analytics-dashboard__section');
  heatmapSection.add(new ActivityHeatmap({ 
    context: ctx, 
    data: heatmap,
    title: `Activity by Hour (${period})`
  }));
  grid.add(heatmapSection);

  // Leaderboard
  const leaderboardSection = new jsgui.Control({ context: ctx, tagName: 'div' });
  leaderboardSection.add_class('analytics-dashboard__section');
  leaderboardSection.add(new DomainLeaderboard({ 
    context: ctx, 
    domains: leaderboard.slice(0, 15), // Top 15 for dashboard
    period
  }));
  grid.add(leaderboardSection);

  container.add(grid);

  return container;
}

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

function createApp(service = analyticsService) {
  const app = express();

  // JSON API endpoints
  app.get('/api/analytics/trends', (req, res) => {
    try {
      const period = req.query.period || '30d';
      const trends = service.getArticleCountsByDate(period);
      res.json({ success: true, data: trends, period });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/leaderboard', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const period = req.query.period || '30d';
      const leaderboard = service.getDomainLeaderboard(limit, period);
      res.json({ success: true, data: leaderboard, period });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/heatmap', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const heatmap = service.getHourlyActivity(period);
      res.json({ success: true, data: heatmap, period });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/categories', (req, res) => {
    try {
      const period = req.query.period || '30d';
      const categories = service.getCategoryBreakdown(period);
      res.json({ success: true, data: categories, period });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/success-rate', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const successRate = service.getExtractionSuccessRate(period);
      res.json({ success: true, data: successRate, period });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/summary', (req, res) => {
    try {
      const stats = service.getOverallStats();
      res.json({ success: true, data: stats });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Historical Metrics API (Added 2026-01-06)
  // ─────────────────────────────────────────────────────────────

  app.get('/api/analytics/throughput', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const data = service.getThroughputTrend(period);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/success-trend', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const data = service.getSuccessRateTrend(period);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/hub-health', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 50;
      const data = service.getHubHealth(limit);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/analytics/layout-signatures', (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const data = service.getLayoutSignatureStats(limit);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SSR dashboard page
  app.get('/', (req, res) => {
    try {
      const period = req.query.period || '30d';
      
      const trends = service.getArticleCountsByDate(period);
      const leaderboard = service.getDomainLeaderboard(50, period);
      const heatmap = service.getHourlyActivity(period);
      const stats = service.getOverallStats();
      const successRate = service.getExtractionSuccessRate(period);

      const ctx = new jsgui.Page_Context();
      const content = renderDashboard(ctx, period, trends, leaderboard, heatmap, stats, successRate);
      res.send(renderPage('Historical Analytics Dashboard', content));
    } catch (err) {
      console.error('Dashboard render error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  // Leaderboard page (full list)
  app.get('/leaderboard', (req, res) => {
    try {
      const period = req.query.period || '30d';
      const sortBy = req.query.sort || 'articleCount';
      const sortOrder = req.query.order || 'desc';
      const leaderboard = service.getDomainLeaderboard(50, period);

      // Apply sorting
      const sorted = [...leaderboard];
      sorted.sort((a, b) => {
        let aVal = a[sortBy] ?? 0;
        let bVal = b[sortBy] ?? 0;
        if (typeof aVal === 'string') aVal = aVal.toLowerCase();
        if (typeof bVal === 'string') bVal = bVal.toLowerCase();
        return sortOrder === 'desc' ? (bVal > aVal ? 1 : -1) : (aVal > bVal ? 1 : -1);
      });

      const ctx = new jsgui.Page_Context();
      const container = new jsgui.Control({ context: ctx, tagName: 'div' });

      container.add(new PeriodSelector({ 
        context: ctx, 
        selected: period,
        baseUrl: '/leaderboard'
      }));

      const section = new jsgui.Control({ context: ctx, tagName: 'div' });
      section.add_class('analytics-dashboard__section');
      section.add(new DomainLeaderboard({
        context: ctx,
        domains: sorted,
        sortBy,
        sortOrder,
        period,
        baseUrl: '/leaderboard'
      }));
      container.add(section);

      res.send(renderPage('Domain Leaderboard - Analytics', container));
    } catch (err) {
      console.error('Leaderboard page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  return app;
}

// ─────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────

let server;

function startServer(options = {}) {
  const port = options.port || PORT;
  const dbPath = options.dbPath || DB_PATH;
  
  initDb(dbPath);
  const app = createApp(analyticsService);
  
  server = wrapServerForCheck(app, port, undefined, () => {
    console.log(`\n📊 Analytics Hub running at http://localhost:${port}`);
    console.log(`   Database: ${dbPath}\n`);
  });

  return { app, server, close: () => closeServer() };
}

function createAnalyticsHubRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle
  } = options;

  let openedDbHandle = null;
  let dbHandle = null;
  let close = () => {};

  if (typeof getDbHandle === 'function') {
    dbHandle = getDbHandle();
  } else {
    openedDbHandle = new Database(dbPath, { readonly: true });
    dbHandle = openedDbHandle;
    close = () => {
      try {
        openedDbHandle.close();
      } catch (err) {
        // ignore
      }
    };
  }

  const service = new AnalyticsService(dbHandle);
  const router = createApp(service);
  return { router, close };
}

function closeServer() {
  if (server) {
    server.close();
    server = null;
  }
  if (db) {
    db.close();
    db = null;
  }
}

if (require.main === module) {
  startServer();

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeServer();
    process.exit(0);
  });
}

module.exports = { 
  createApp, 
  createAnalyticsHubRouter,
  startServer, 
  closeServer, 
  initDb,
  AnalyticsService
};
