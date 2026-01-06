'use strict';

/**
 * Extraction Quality Dashboard Server
 * 
 * Express server at port 3100 providing:
 * - GET / - Main dashboard (SSR with jsgui3-html)
 * - GET /api/quality/summary - Overall quality metrics
 * - GET /api/quality/domains - Per-domain breakdown
 * - GET /api/quality/regressions - Recent quality drops
 * - GET /api/quality/distribution - Confidence histogram
 * 
 * Usage:
 *   node src/ui/server/qualityDashboard/server.js
 *   Open http://localhost:3100
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { wrapServerForCheck } = require('../utils/serverStartupCheck');

const { QualityMetricsService } = require('./QualityMetricsService');
const { DomainQualityTable, ConfidenceHistogram, RegressionAlerts } = require('./controls');

const PORT = process.env.PORT || 3100;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    port: Number(process.env.PORT) || Number(PORT) || 3100,
    dbPath: process.env.DB_PATH || DB_PATH
  };

  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token === '--port' && argv[i + 1]) {
      i += 1;
      const value = Number(argv[i]);
      if (Number.isFinite(value) && value > 0) {
        args.port = value;
      }
      continue;
    }

    if ((token === '--db-path' || token === '--db') && argv[i + 1]) {
      i += 1;
      args.dbPath = argv[i];
      continue;
    }
  }

  return args;
}

// ─────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────

let db;
let metricsService;

function initDb(dbPath = DB_PATH) {
  db = new Database(dbPath, { readonly: true });
  metricsService = new QualityMetricsService(db);
  return { db, metricsService };
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
  .quality-dashboard__header {
    background: var(--bg-secondary);
    padding: 20px 24px;
    border-bottom: 1px solid var(--border-color);
  }

  .quality-dashboard__title {
    margin: 0 0 4px 0;
    font-size: 24px;
    font-weight: 600;
  }

  .quality-dashboard__subtitle {
    margin: 0;
    color: var(--text-secondary);
    font-size: 14px;
  }

  .quality-dashboard__nav {
    margin-top: 16px;
    display: flex;
    gap: 24px;
  }

  .quality-dashboard__nav-link {
    color: var(--text-secondary);
    padding: 8px 0;
    border-bottom: 2px solid transparent;
  }

  .quality-dashboard__nav-link--active {
    color: var(--text-primary);
    border-bottom-color: var(--accent-blue);
  }

  /* Main content */
  .quality-dashboard__main {
    padding: 24px;
    max-width: 1400px;
    margin: 0 auto;
  }

  /* Summary cards */
  .quality-dashboard__summary {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
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
    font-size: 32px;
    font-weight: 700;
    margin-bottom: 4px;
  }

  .summary-card__label {
    color: var(--text-secondary);
    font-size: 14px;
  }

  .summary-card--success .summary-card__value { color: var(--accent-green); }
  .summary-card--warning .summary-card__value { color: var(--accent-yellow); }
  .summary-card--danger .summary-card__value { color: var(--accent-red); }

  /* Quality tiers */
  .quality-tiers {
    display: flex;
    gap: 8px;
    margin-top: 12px;
  }

  .quality-tier {
    flex: 1;
    text-align: center;
    padding: 8px;
    border-radius: 4px;
    font-size: 12px;
  }

  .quality-tier--high { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
  .quality-tier--medium { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }
  .quality-tier--low { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }

  .quality-tier__count {
    font-size: 18px;
    font-weight: 600;
    display: block;
  }

  /* Sections */
  .quality-dashboard__section {
    background: var(--bg-secondary);
    border-radius: 8px;
    padding: 24px;
    margin-bottom: 24px;
    border: 1px solid var(--border-color);
  }

  .quality-dashboard__section-title {
    margin: 0 0 16px 0;
    font-size: 18px;
    font-weight: 600;
  }

  /* Quality table */
  .quality-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .quality-table__header {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-card);
    border-bottom: 1px solid var(--border-color);
    font-weight: 600;
  }

  .quality-table__sort-link {
    color: var(--text-primary);
    text-decoration: none;
  }

  .quality-table__sort-link:hover {
    color: var(--accent-blue);
  }

  .quality-table tbody tr {
    border-bottom: 1px solid var(--border-color);
  }

  .quality-table tbody tr:hover {
    background: var(--bg-card);
  }

  .quality-table td {
    padding: 12px 16px;
  }

  .quality-table__row--low { background: rgba(239, 68, 68, 0.05); }
  .quality-table__row--medium { background: rgba(234, 179, 8, 0.05); }

  .quality-badge {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    font-weight: 600;
    font-size: 13px;
  }

  .quality-badge--high { background: rgba(34, 197, 94, 0.2); color: var(--accent-green); }
  .quality-badge--medium { background: rgba(234, 179, 8, 0.2); color: var(--accent-yellow); }
  .quality-badge--low { background: rgba(239, 68, 68, 0.2); color: var(--accent-red); }

  .quality-table__empty {
    text-align: center;
    padding: 48px;
    color: var(--text-secondary);
  }

  /* Confidence histogram */
  .confidence-histogram__title {
    margin: 0 0 16px 0;
    font-size: 16px;
    font-weight: 600;
  }

  .confidence-histogram__chart {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .confidence-histogram__row {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .confidence-histogram__label {
    width: 70px;
    font-size: 13px;
    color: var(--text-secondary);
    text-align: right;
  }

  .confidence-histogram__bar-container {
    flex: 1;
    height: 24px;
    background: var(--bg-card);
    border-radius: 4px;
    overflow: hidden;
  }

  .confidence-histogram__bar {
    height: 100%;
    border-radius: 4px;
    transition: width 0.3s ease;
  }

  .confidence-histogram__stats {
    width: 120px;
    font-size: 13px;
    color: var(--text-secondary);
  }

  .confidence-histogram__legend {
    display: flex;
    flex-wrap: wrap;
    gap: 16px;
    margin-top: 16px;
    padding-top: 16px;
    border-top: 1px solid var(--border-color);
  }

  .confidence-histogram__legend-item {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--text-secondary);
  }

  .confidence-histogram__swatch {
    width: 12px;
    height: 12px;
    border-radius: 2px;
  }

  .confidence-histogram__empty {
    text-align: center;
    padding: 32px;
    color: var(--text-secondary);
  }

  /* Regression alerts */
  .regression-alerts__header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
  }

  .regression-alerts__title {
    margin: 0;
    font-size: 16px;
    font-weight: 600;
  }

  .regression-alerts__count {
    background: var(--accent-red);
    color: white;
    padding: 2px 8px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
  }

  .regression-alerts__cards {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .regression-alert {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 16px;
    background: var(--bg-card);
    border-radius: 8px;
    border-left: 4px solid var(--border-color);
  }

  .regression-alert--critical { border-left-color: var(--accent-red); }
  .regression-alert--warning { border-left-color: var(--accent-yellow); }
  .regression-alert--info { border-left-color: var(--accent-blue); }

  .regression-alert__icon {
    font-size: 24px;
  }

  .regression-alert__content {
    flex: 1;
  }

  .regression-alert__domain {
    font-weight: 600;
    margin-bottom: 4px;
  }

  .regression-alert__drop {
    font-size: 14px;
  }

  .regression-alert__drop-value {
    color: var(--accent-red);
    font-weight: 700;
  }

  .regression-alert__drop-label {
    color: var(--text-secondary);
  }

  .regression-alert__details {
    font-size: 12px;
    color: var(--text-secondary);
    margin-top: 4px;
  }

  .regression-alert__action-link {
    font-size: 13px;
    color: var(--accent-blue);
  }

  .regression-alerts__empty {
    text-align: center;
    padding: 32px;
    background: rgba(34, 197, 94, 0.1);
    border-radius: 8px;
  }

  .regression-alerts__success-icon {
    font-size: 32px;
    display: block;
    margin-bottom: 8px;
  }

  .regression-alerts__more {
    text-align: center;
    padding: 12px;
    color: var(--text-secondary);
    font-size: 13px;
  }

  /* Grid layout */
  .quality-dashboard__grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }

  @media (max-width: 1024px) {
    .quality-dashboard__grid {
      grid-template-columns: 1fr;
    }
  }

  /* Footer */
  .quality-dashboard__footer {
    padding: 16px 24px;
    text-align: center;
    color: var(--text-secondary);
    font-size: 12px;
    border-top: 1px solid var(--border-color);
  }
`;

// ─────────────────────────────────────────────────────────────
// jsgui3 Controls
// ─────────────────────────────────────────────────────────────

const StringControl = jsgui.String_Control;

/**
 * Summary card control
 */
class SummaryCard extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    this.icon = spec.icon || '📊';
    this.value = spec.value ?? '-';
    this.label = spec.label || '';
    this.variant = spec.variant || 'default';
    
    this.add_class('summary-card');
    if (this.variant !== 'default') {
      this.add_class(`summary-card--${this.variant}`);
    }
    
    this._compose();
  }

  _compose() {
    const icon = new jsgui.Control({ context: this.context, tagName: 'div' });
    icon.add_class('summary-card__icon');
    icon.add(new StringControl({ context: this.context, text: this.icon }));
    this.add(icon);

    const value = new jsgui.Control({ context: this.context, tagName: 'div' });
    value.add_class('summary-card__value');
    value.add(new StringControl({ context: this.context, text: String(this.value) }));
    this.add(value);

    const label = new jsgui.Control({ context: this.context, tagName: 'div' });
    label.add_class('summary-card__label');
    label.add(new StringControl({ context: this.context, text: this.label }));
    this.add(label);
  }
}

/**
 * Quality tiers display
 */
class QualityTiers extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    this.tiers = spec.tiers || { high: 0, medium: 0, low: 0 };
    
    this.add_class('quality-tiers');
    this._compose();
  }

  _compose() {
    const tierData = [
      { key: 'high', label: 'High', count: this.tiers.high },
      { key: 'medium', label: 'Medium', count: this.tiers.medium },
      { key: 'low', label: 'Low', count: this.tiers.low }
    ];

    for (const tier of tierData) {
      const tierEl = new jsgui.Control({ context: this.context, tagName: 'div' });
      tierEl.add_class('quality-tier');
      tierEl.add_class(`quality-tier--${tier.key}`);

      const count = new jsgui.Control({ context: this.context, tagName: 'span' });
      count.add_class('quality-tier__count');
      count.add(new StringControl({ context: this.context, text: tier.count.toLocaleString() }));
      tierEl.add(count);

      tierEl.add(new StringControl({ context: this.context, text: tier.label }));
      this.add(tierEl);
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────

function renderPage(title, content, activePage = 'dashboard') {
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
  header.add_class('quality-dashboard__header');
  
  const h1 = new jsgui.Control({ context: ctx, tagName: 'h1' });
  h1.add_class('quality-dashboard__title');
  h1.add(new StringControl({ context: ctx, text: '📊 Extraction Quality Dashboard' }));
  header.add(h1);

  const subtitle = new jsgui.Control({ context: ctx, tagName: 'p' });
  subtitle.add_class('quality-dashboard__subtitle');
  subtitle.add(new StringControl({ context: ctx, text: 'Monitor and analyze article extraction quality' }));
  header.add(subtitle);

  // Navigation
  const nav = new jsgui.Control({ context: ctx, tagName: 'nav' });
  nav.add_class('quality-dashboard__nav');

  const navLinks = [
    { href: '/', label: '📈 Overview', key: 'dashboard' },
    { href: '/domains', label: '🌐 Domains', key: 'domains' },
    { href: '/regressions', label: '📉 Regressions', key: 'regressions' }
  ];

  for (const link of navLinks) {
    const a = new jsgui.Control({ context: ctx, tagName: 'a' });
    a.dom.attributes.href = link.href;
    a.add_class('quality-dashboard__nav-link');
    if (link.key === activePage) {
      a.add_class('quality-dashboard__nav-link--active');
    }
    a.add(new StringControl({ context: ctx, text: link.label }));
    nav.add(a);
  }

  header.add(nav);
  page.body.add(header);

  // Main content
  const main = new jsgui.Control({ context: ctx, tagName: 'main' });
  main.add_class('quality-dashboard__main');
  main.dom.attributes.role = 'main';
  main.add(content);
  page.body.add(main);

  // Footer
  const footer = new jsgui.Control({ context: ctx, tagName: 'footer' });
  footer.add_class('quality-dashboard__footer');
  footer.add(new StringControl({ 
    context: ctx, 
    text: `Generated at ${new Date().toISOString()} • Database: ${path.basename(DB_PATH)}` 
  }));
  page.body.add(footer);

  return page.all_html_render();
}

function renderDashboard(ctx, summary, distribution, regressions) {
  const container = new jsgui.Control({ context: ctx, tagName: 'div' });

  // Summary cards
  const summaryGrid = new jsgui.Control({ context: ctx, tagName: 'div' });
  summaryGrid.add_class('quality-dashboard__summary');

  const avgConfidenceValue = summary.avgConfidence 
    ? `${(summary.avgConfidence * 100).toFixed(1)}%` 
    : '-';
  const avgVariant = summary.avgConfidence >= 0.7 ? 'success' 
    : summary.avgConfidence >= 0.5 ? 'warning' 
    : 'danger';

  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '📊',
    value: avgConfidenceValue,
    label: 'Average Confidence',
    variant: avgVariant
  }));

  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: '📰',
    value: summary.totalArticles?.toLocaleString() || '0',
    label: 'Total Articles'
  }));

  const regressionVariant = regressions.length > 0 ? 'danger' : 'success';
  summaryGrid.add(new SummaryCard({
    context: ctx,
    icon: regressions.length > 0 ? '⚠️' : '✅',
    value: regressions.length,
    label: 'Active Regressions',
    variant: regressionVariant
  }));

  container.add(summaryGrid);

  // Quality tiers
  if (summary.qualityTiers) {
    const tiersSection = new jsgui.Control({ context: ctx, tagName: 'div' });
    tiersSection.add_class('quality-dashboard__section');
    
    const tiersTitle = new jsgui.Control({ context: ctx, tagName: 'h2' });
    tiersTitle.add_class('quality-dashboard__section-title');
    tiersTitle.add(new StringControl({ context: ctx, text: '📊 Quality Distribution' }));
    tiersSection.add(tiersTitle);

    tiersSection.add(new QualityTiers({ context: ctx, tiers: summary.qualityTiers }));
    container.add(tiersSection);
  }

  // Two-column grid
  const grid = new jsgui.Control({ context: ctx, tagName: 'div' });
  grid.add_class('quality-dashboard__grid');

  // Histogram
  const histSection = new jsgui.Control({ context: ctx, tagName: 'div' });
  histSection.add_class('quality-dashboard__section');
  histSection.add(new ConfidenceHistogram({ context: ctx, buckets: distribution }));
  grid.add(histSection);

  // Regressions
  const regSection = new jsgui.Control({ context: ctx, tagName: 'div' });
  regSection.add_class('quality-dashboard__section');
  regSection.add(new RegressionAlerts({ context: ctx, regressions }));
  grid.add(regSection);

  container.add(grid);

  return container;
}

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

function createApp(service = metricsService) {
  const app = express();
  const isCheckMode = process.argv.includes('--check');

  // JSON API endpoints
  app.get('/api/quality/summary', (req, res) => {
    try {
      const summary = service.getSummary();
      res.json({ success: true, data: summary });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/quality/domains', (req, res) => {
    try {
      const options = {
        minArticles: parseInt(req.query.minArticles, 10) || 5,
        limit: parseInt(req.query.limit, 10) || 50,
        sortBy: req.query.sort || 'confidence',
        sortOrder: req.query.order || 'asc'
      };
      const domains = service.getDomains(options);
      res.json({ success: true, data: domains });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/quality/regressions', (req, res) => {
    try {
      const threshold = parseFloat(req.query.threshold) || 0.1;
      const lookbackDays = parseInt(req.query.days, 10) || 7;
      const regressions = service.getRegressions(threshold, lookbackDays);
      res.json({ success: true, data: regressions });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/quality/distribution', (req, res) => {
    try {
      const distribution = service.getConfidenceDistribution();
      res.json({ success: true, data: distribution });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // ─────────────────────────────────────────────────────────────
  // Quality Trending API (Added 2026-01-06)
  // ─────────────────────────────────────────────────────────────

  app.get('/api/quality/trend', (req, res) => {
    try {
      const period = req.query.period || '30d';
      const data = service.getQualityTrend(period);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/quality/by-classification', (req, res) => {
    try {
      const period = req.query.period || '30d';
      const data = service.getQualityByClassification(period);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  app.get('/api/quality/movers', (req, res) => {
    try {
      const period = req.query.period || '7d';
      const minArticles = parseInt(req.query.minArticles, 10) || 10;
      const data = service.getQualityMovers(period, minArticles);
      res.json({ success: true, data });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // SSR pages
  app.get('/', (req, res) => {
    try {
      if (isCheckMode) {
        // Keep startup checks fast/deterministic: avoid heavy DB reads during `--check`.
        res.type('html').send('<!DOCTYPE html><html><head><title>Quality Dashboard (check)</title></head><body>ok</body></html>');
        return;
      }
      const summary = service.getSummary();
      const distribution = service.getConfidenceDistribution();
      const regressions = service.getRegressions();

      const ctx = new jsgui.Page_Context();
      const content = renderDashboard(ctx, summary, distribution, regressions);
      res.send(renderPage('Quality Dashboard', content, 'dashboard'));
    } catch (err) {
      console.error('Dashboard render error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  app.get('/domains', (req, res) => {
    try {
      const sortBy = req.query.sort || 'confidence';
      const sortOrder = req.query.order || 'asc';
      const domains = service.getDomains({ sortBy, sortOrder, limit: 100 });

      const ctx = new jsgui.Page_Context();
      const section = new jsgui.Control({ context: ctx, tagName: 'div' });
      section.add_class('quality-dashboard__section');

      const title = new jsgui.Control({ context: ctx, tagName: 'h2' });
      title.add_class('quality-dashboard__section-title');
      title.add(new StringControl({ context: ctx, text: '🌐 Domain Quality Breakdown' }));
      section.add(title);

      section.add(new DomainQualityTable({
        context: ctx,
        domains,
        sortBy,
        sortOrder,
        baseUrl: '/domains'
      }));

      res.send(renderPage('Domains - Quality Dashboard', section, 'domains'));
    } catch (err) {
      console.error('Domains page error:', err);
      res.status(500).send(`Error: ${err.message}`);
    }
  });

  app.get('/regressions', (req, res) => {
    try {
      const regressions = service.getRegressions(0.05); // Lower threshold for more results

      const ctx = new jsgui.Page_Context();
      const section = new jsgui.Control({ context: ctx, tagName: 'div' });
      section.add_class('quality-dashboard__section');

      section.add(new RegressionAlerts({
        context: ctx,
        regressions,
        maxDisplay: 50
      }));

      res.send(renderPage('Regressions - Quality Dashboard', section, 'regressions'));
    } catch (err) {
      console.error('Regressions page error:', err);
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
  const app = createApp(metricsService);
  
  server = wrapServerForCheck(app, port, undefined, () => {
    console.log(`\n📊 Quality Dashboard running at http://localhost:${port}`);
    console.log(`   Database: ${dbPath}\n`);
  });

  return { app, server, close: () => closeServer() };
}

function createQualityDashboardRouter(options = {}) {
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

  const service = new QualityMetricsService(dbHandle);
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
  const args = parseArgs();
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'QualityDashboard';
  startServer({ port: args.port, dbPath: args.dbPath });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    closeServer();
    process.exit(0);
  });
}

module.exports = { 
  createApp, 
  createQualityDashboardRouter,
  startServer, 
  closeServer, 
  initDb,
  QualityMetricsService,
  SummaryCard,
  QualityTiers
};
