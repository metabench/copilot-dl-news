'use strict';

/**
 * Crawler Monitor Dashboard - Real-time crawler health monitoring
 * 
 * Features:
 * - Active worker count with status indicators
 * - Queue depth (pending/in-progress/completed/failed)
 * - Throughput chart (pages/sec, errors/sec)
 * - Domain status and locks
 * - Recent errors list
 * - SSE endpoint for real-time updates
 * 
 * Usage:
 *   node src/ui/server/crawlerMonitor/server.js
 *   Open http://localhost:3008
 * 
 * Endpoints:
 *   GET /           - Dashboard HTML
 *   GET /api/metrics - Current metrics (JSON)
 *   GET /api/metrics/stream - SSE stream
 *   GET /api/workers - Worker list
 *   GET /api/queue   - Queue stats
 *   GET /api/errors  - Recent errors
 *   GET /api/domains - Domain stats
 * 
 * @module src/ui/server/crawlerMonitor/server
 */

const express = require('express');
const jsgui = require('jsgui3-html');

const { WorkerRegistry, DomainLockManager, WorkDistributor } = require('../../../crawler/coordinator');
const { CrawlerMetricsService } = require('../../../crawler/metrics');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');

const PORT = process.env.CRAWLER_MONITOR_PORT || process.env.PORT || 3008;

// ─────────────────────────────────────────────────────────────────
// Mock components for standalone operation
// ─────────────────────────────────────────────────────────────────

/** @type {WorkerRegistry} */
let registry;
/** @type {DomainLockManager} */
let lockManager;
/** @type {CrawlerMetricsService} */
let metricsService;

// SSE clients
const sseClients = new Set();

let componentsInitialized = false;

/**
 * Initialize coordinator components
 */
async function initComponents() {
  if (componentsInitialized) return;
  componentsInitialized = true;

  registry = new WorkerRegistry({
    heartbeatIntervalMs: 5000,
    staleTimeoutMs: 15000
  });
  
  lockManager = new DomainLockManager({
    lockTimeoutMs: 60000
  });
  
  metricsService = new CrawlerMetricsService({
    registry,
    lockManager,
    intervalMs: 1000,
    historySize: 120
  });
  
  await registry.initialize();
  await metricsService.start();
  
  // Forward metrics to SSE clients
  metricsService.on('metrics', (metrics) => {
    const data = JSON.stringify(metrics);
    for (const client of sseClients) {
      client.write(`data: ${data}\n\n`);
    }
  });
  
  // Add some demo workers if in demo mode
  if (process.env.CRAWLER_MONITOR_DEMO === '1') {
    await addDemoData();
  }
}

/**
 * Add demo data for development/testing
 */
async function addDemoData() {
  // Register demo workers
  await registry.register({
    id: 'worker-1',
    hostname: 'crawler-node-1',
    pid: 12345,
    metadata: { version: '1.0.0' },
    capabilities: { maxConcurrency: 10 }
  });
  
  await registry.register({
    id: 'worker-2',
    hostname: 'crawler-node-2',
    pid: 23456,
    metadata: { version: '1.0.0' },
    capabilities: { maxConcurrency: 10 }
  });
  
  // Acquire some domain locks
  await lockManager.acquire({
    domain: 'example.com',
    workerId: 'worker-1',
    reason: 'crawling'
  });
  
  await lockManager.acquire({
    domain: 'news.ycombinator.com',
    workerId: 'worker-2',
    reason: 'crawling'
  });
  
  // Record some mock events
  metricsService.recordVisit({
    url: 'https://example.com/',
    workerId: 'worker-1',
    duration: 150,
    statusCode: 200
  });
  
  metricsService.recordError({
    url: 'https://flaky-site.com/page',
    workerId: 'worker-1',
    error: 'ECONNRESET',
    message: 'Connection reset by peer'
  });
}

// ─────────────────────────────────────────────────────────────────
// Helper function to create elements with class
// ─────────────────────────────────────────────────────────────────

/**
 * Create a Control with class properly set
 * @param {object} ctx - jsgui context
 * @param {string} tagName - HTML tag name
 * @param {string} [className] - CSS class name
 * @param {string} [text] - Text content
 * @returns {jsgui.Control}
 */
function el(ctx, tagName, className, text) {
  const control = new jsgui.Control({ context: ctx, tagName });
  if (className) {
    control.dom.attributes.class = className;
  }
  if (text) {
    control.add(text);
  }
  return control;
}

// ─────────────────────────────────────────────────────────────────
// Custom Controls
// ─────────────────────────────────────────────────────────────────

/**
 * Metric Card Control - displays a single metric with value and label
 */
class MetricCardControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'metric-card';
    
    const value = spec.value ?? 0;
    const label = spec.label ?? '';
    const suffix = spec.suffix ?? '';
    const color = spec.color ?? '#fff';
    
    const valueEl = el(this.context, 'div', 'metric-value');
    valueEl.dom.attributes.style = `color: ${color}`;
    valueEl.add(String(value) + suffix);
    this.add(valueEl);
    
    const labelEl = el(this.context, 'div', 'metric-label');
    labelEl.add(label);
    this.add(labelEl);
  }
}

/**
 * Metric Cards Row - shows key metrics in a horizontal row
 */
class MetricCardsControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'metric-cards';
    
    const metrics = spec.metrics || {};
    
    this.add(new MetricCardControl({
      context: this.context,
      label: 'Active Workers',
      value: metrics.workers?.active ?? 0,
      color: '#7ec8e3'
    }));
    
    this.add(new MetricCardControl({
      context: this.context,
      label: 'Pages/sec',
      value: (metrics.throughput?.pagesPerSecond ?? 0).toFixed(1),
      color: '#4ade80'
    }));
    
    this.add(new MetricCardControl({
      context: this.context,
      label: 'Queue Size',
      value: metrics.queue?.pending ?? 0,
      color: '#fbbf24'
    }));
    
    this.add(new MetricCardControl({
      context: this.context,
      label: 'Errors',
      value: metrics.errors?.total ?? 0,
      color: '#ef4444'
    }));
    
    this.add(new MetricCardControl({
      context: this.context,
      label: 'Locked Domains',
      value: metrics.locks?.count ?? 0,
      color: '#a78bfa'
    }));
  }
}

/**
 * Throughput Chart - simplified chart showing recent throughput
 */
class ThroughputChartControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'panel';
    
    const title = el(this.context, 'h2', 'panel-title');
    title.add('Throughput (last 60s)');
    this.add(title);
    
    const history = spec.history || [];
    const maxPages = Math.max(1, ...history.map(h => h.pagesPerSecond || 0));
    
    const chartContainer = el(this.context, 'div', 'chart-container');
    
    const bars = el(this.context, 'div', 'chart-bars');
    history.slice(-60).forEach(point => {
      const height = Math.max(2, (point.pagesPerSecond / maxPages) * 100);
      const bar = el(this.context, 'div', 'chart-bar');
      bar.dom.attributes.style = `height: ${height}%`;
      bars.add(bar);
    });
    chartContainer.add(bars);
    
    this.add(chartContainer);
  }
}

/**
 * Worker List Control - shows active workers
 */
class WorkerListControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'panel';
    
    const title = el(this.context, 'h2', 'panel-title');
    title.add('Active Workers');
    this.add(title);
    
    const workers = spec.workers || [];
    
    if (workers.length === 0) {
      const empty = el(this.context, 'div', 'empty-state');
      empty.add('No workers registered');
      this.add(empty);
      return;
    }
    
    const table = this._createTable(['ID', 'Hostname', 'PID', 'Status', 'Last Seen']);
    workers.forEach(worker => {
      const status = worker.status === 'active' ? 'Active' : 'Stale';
      const statusClass = worker.status === 'active' ? 'status-active' : 'status-stale';
      const lastSeen = worker.lastHeartbeat ? new Date(worker.lastHeartbeat).toLocaleTimeString() : '-';
      
      const row = el(this.context, 'tr');
      row.add(this._cell(worker.id));
      row.add(this._cell(worker.hostname || '-'));
      row.add(this._cell(String(worker.pid || '-')));
      
      const statusCell = el(this.context, 'td');
      const statusBadge = el(this.context, 'span', statusClass);
      statusBadge.add(status);
      statusCell.add(statusBadge);
      row.add(statusCell);
      
      row.add(this._cell(lastSeen));
      table.tbody.add(row);
    });
    
    this.add(table.wrapper);
  }
  
  _createTable(headers) {
    const wrapper = el(this.context, 'div', 'table-wrapper');
    const table = el(this.context, 'table', 'data-table');
    const thead = el(this.context, 'thead');
    const headerRow = el(this.context, 'tr');
    
    headers.forEach(h => {
      const th = el(this.context, 'th');
      th.add(h);
      headerRow.add(th);
    });
    thead.add(headerRow);
    table.add(thead);
    
    const tbody = el(this.context, 'tbody');
    table.add(tbody);
    wrapper.add(table);
    
    return { wrapper, table, tbody };
  }
  
  _cell(content) {
    const td = el(this.context, 'td');
    td.add(content);
    return td;
  }
}

/**
 * Locks List Control - shows domain locks
 */
class LocksListControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'panel';
    
    const title = el(this.context, 'h2', 'panel-title');
    title.add('Domain Locks');
    this.add(title);
    
    const locks = spec.locks || [];
    
    if (locks.length === 0) {
      const empty = el(this.context, 'div', 'empty-state');
      empty.add('No active locks');
      this.add(empty);
      return;
    }
    
    const table = new WorkerListControl.prototype._createTable.call(this, ['Domain', 'Worker', 'Since']);
    locks.forEach(lock => {
      const since = lock.acquiredAt ? new Date(lock.acquiredAt).toLocaleTimeString() : '-';
      
      const row = el(this.context, 'tr');
      row.add(this._cell(lock.domain));
      row.add(this._cell(lock.workerId));
      row.add(this._cell(since));
      table.tbody.add(row);
    });
    
    this.add(table.wrapper);
  }
  
  _cell(content) {
    const td = el(this.context, 'td');
    td.add(content);
    return td;
  }
}

/**
 * Errors List Control - shows recent errors
 */
class ErrorsListControl extends jsgui.Control {
  constructor(spec = {}) {
    super({
      context: spec.context,
      tagName: 'div'
    });
    this.dom.attributes.class = 'panel';
    
    const title = el(this.context, 'h2', 'panel-title');
    title.add('Recent Errors');
    this.add(title);
    
    const errors = spec.errors || [];
    
    if (errors.length === 0) {
      const empty = el(this.context, 'div', 'empty-state');
      empty.add('No recent errors');
      this.add(empty);
      return;
    }
    
    const list = el(this.context, 'div', 'error-list');
    errors.slice(0, 10).forEach(err => {
      const item = el(this.context, 'div', 'error-item');
      
      const urlEl = el(this.context, 'div', 'error-url');
      urlEl.add(err.url || 'Unknown URL');
      item.add(urlEl);
      
      const msgEl = el(this.context, 'div', 'error-message');
      msgEl.add(`${err.error}: ${err.message}`);
      item.add(msgEl);
      
      const timeEl = el(this.context, 'div', 'error-time');
      timeEl.add(err.timestamp ? new Date(err.timestamp).toLocaleTimeString() : '-');
      item.add(timeEl);
      
      list.add(item);
    });
    
    this.add(list);
  }
}

// ─────────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────────

function renderPage(title, content) {
  const ctx = new jsgui.Page_Context();
  const page = new jsgui.Standard_Web_Page({ context: ctx });

  // Title
  const titleEl = el(ctx, 'title');
  titleEl.add(title);
  page.head.add(titleEl);

  // Meta charset
  const meta = new jsgui.Control({ context: ctx, tagName: 'meta' });
  meta.dom.attributes.charset = 'UTF-8';
  page.head.add(meta);

  // Styles
  const style = el(ctx, 'style');
  style.add(`
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      margin: 0;
      background: #1a1a2e;
      color: #eee;
    }
    .header {
      background: #16213e;
      padding: 16px 24px;
      border-bottom: 1px solid #2a3a5a;
    }
    .header h1 {
      margin: 0;
      font-size: 20px;
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .status-badge {
      font-size: 12px;
      padding: 4px 8px;
      border-radius: 4px;
      background: #2a4a3a;
    }
    .content {
      padding: 24px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .metric-cards {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
      gap: 16px;
      margin-bottom: 24px;
    }
    .metric-card {
      background: #1e293b;
      border-radius: 8px;
      padding: 16px;
      text-align: center;
    }
    .metric-value {
      font-size: 28px;
      font-weight: bold;
      margin-bottom: 4px;
    }
    .metric-label {
      font-size: 12px;
      color: #94a3b8;
      text-transform: uppercase;
    }
    .row {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 24px;
    }
    @media (max-width: 1000px) {
      .row { grid-template-columns: 1fr; }
    }
    .panel {
      background: #1e293b;
      border-radius: 8px;
      padding: 16px;
      margin-bottom: 16px;
    }
    .panel-title {
      margin: 0 0 16px 0;
      font-size: 16px;
      color: #f8fafc;
    }
    .chart-container {
      height: 100px;
      position: relative;
    }
    .chart-bars {
      display: flex;
      align-items: flex-end;
      height: 100%;
      gap: 2px;
    }
    .chart-bar {
      flex: 1;
      background: linear-gradient(to top, #4ade80, #22c55e);
      border-radius: 2px 2px 0 0;
      min-width: 4px;
    }
    .table-wrapper {
      overflow-x: auto;
    }
    .data-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 14px;
    }
    .data-table th {
      text-align: left;
      padding: 8px;
      background: #2a3a5a;
      font-weight: 500;
    }
    .data-table td {
      padding: 8px;
      border-bottom: 1px solid #333;
    }
    .status-active {
      color: #4ade80;
      font-weight: 500;
    }
    .status-stale {
      color: #f97316;
      font-weight: 500;
    }
    .empty-state {
      text-align: center;
      color: #64748b;
      padding: 24px;
    }
    .error-list {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .error-item {
      background: rgba(239, 68, 68, 0.1);
      border-left: 3px solid #ef4444;
      padding: 8px 12px;
      border-radius: 4px;
    }
    .error-url {
      font-size: 13px;
      color: #7ec8e3;
      margin-bottom: 4px;
      word-break: break-all;
    }
    .error-message {
      font-size: 12px;
      color: #f87171;
    }
    .error-time {
      font-size: 11px;
      color: #64748b;
      margin-top: 4px;
    }
  `);
  page.head.add(style);

  // SSE client script
  const script = el(ctx, 'script');
  script.add(`
    document.addEventListener('DOMContentLoaded', function() {
      const evtSource = new EventSource('/api/metrics/stream');
      evtSource.onmessage = function(event) {
        // TODO: Update DOM directly instead of refresh
      };
      evtSource.onerror = function() {
        console.warn('SSE connection lost, will retry...');
      };
      // Auto-refresh every 5 seconds
      setTimeout(function() { location.reload(); }, 5000);
    });
  `);
  page.head.add(script);

  // Header
  const header = el(ctx, 'header', 'header');
  const h1 = el(ctx, 'h1');
  
  const titleSpan = el(ctx, 'span');
  titleSpan.add('\uD83D\uDD77\uFE0F Crawler Monitor'); // Spider emoji in Unicode
  h1.add(titleSpan);
  
  const statusSpan = el(ctx, 'span', 'status-badge');
  statusSpan.add('\uD83D\uDFE2 Live'); // Green circle emoji
  h1.add(statusSpan);
  
  header.add(h1);
  page.body.add(header);

  // Content
  const contentDiv = el(ctx, 'div', 'content');
  contentDiv.add(content);
  page.body.add(contentDiv);

  return page.all_html_render();
}

// ─────────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────────

const app = express();

// Dashboard
app.get('/', async (req, res) => {
  try {
    const metrics = metricsService.getMetrics();
    const history = metricsService.getHistory(60);
    const errors = metricsService.getRecentErrors(20);
    const locks = await lockManager.getLocks();
    const workers = await registry.getWorkers();

    const ctx = new jsgui.Page_Context();
    
    const container = el(ctx, 'div');

    // Metric cards
    container.add(new MetricCardsControl({ context: ctx, metrics }));

    // Two-column layout
    const row = el(ctx, 'div', 'row');

    // Left column
    const left = el(ctx, 'div');
    left.add(new ThroughputChartControl({ context: ctx, history }));
    left.add(new WorkerListControl({ context: ctx, workers }));
    row.add(left);

    // Right column
    const right = el(ctx, 'div');
    right.add(new LocksListControl({ context: ctx, locks }));
    right.add(new ErrorsListControl({ context: ctx, errors }));
    row.add(right);

    container.add(row);

    res.send(renderPage('Crawler Monitor', container));
  } catch (err) {
    res.status(500).send(`Error: ${err.message}`);
  }
});

// API: Current metrics
app.get('/api/metrics', (req, res) => {
  res.json(metricsService.getMetrics());
});

// API: SSE stream
app.get('/api/metrics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  sseClients.add(res);
  
  // Send initial metrics
  const metrics = metricsService.getMetrics();
  res.write(`data: ${JSON.stringify(metrics)}\n\n`);
  
  req.on('close', () => {
    sseClients.delete(res);
  });
});

// API: Worker list (returns array directly)
app.get('/api/workers', async (req, res) => {
  const workers = await registry.getWorkers();
  res.json(workers);
});

// API: Queue stats (returns flat object)
app.get('/api/queue', async (req, res) => {
  const metrics = metricsService.getMetrics();
  const queue = metrics.queue || {};
  res.json({
    pending: queue.pending ?? 0,
    inProgress: queue.inProgress ?? 0,
    completed: queue.completed ?? 0,
    failed: queue.failed ?? 0
  });
});

// API: Recent errors (returns array directly)
app.get('/api/errors', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const errors = metricsService.getRecentErrors(limit);
  res.json(errors);
});

// API: Locks list (returns array directly)
app.get('/api/locks', async (req, res) => {
  const locks = await lockManager.getLocks();
  res.json(locks);
});

// API: Domain stats (returns array directly)
app.get('/api/domains', async (req, res) => {
  const locks = await lockManager.getLocks();
  res.json(locks);
});

// API: History (returns array directly)
app.get('/api/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 120;
  const history = metricsService.getHistory(limit);
  res.json(history);
});

// Legacy path
app.get('/api/metrics/history', (req, res) => {
  const limit = parseInt(req.query.limit) || 120;
  const history = metricsService.getHistory(limit);
  res.json(history);
});

// ─────────────────────────────────────────────────────────────────
// Server start
// ─────────────────────────────────────────────────────────────────

async function startServer() {
  await initComponents();

  process.env.SERVER_NAME = process.env.SERVER_NAME || 'CrawlerMonitor';
  const server = wrapServerForCheck(app, PORT, undefined, () => {
    console.log(`Crawler Monitor running at http://localhost:${PORT}`);
    if (process.env.CRAWLER_MONITOR_DEMO === '1') {
      console.log('Demo mode enabled - sample data loaded');
    }
  });

  return server;
}

async function createCrawlerMonitorRouter() {
  await initComponents();

  return {
    router: app,
    close: () => {
      // TODO: if/when WorkerRegistry/DomainLockManager/CrawlerMetricsService expose shutdown APIs,
      // call them here.
    }
  };
}

// Start if run directly
if (require.main === module) {
  startServer().catch(err => {
    console.error('Failed to start server:', err);
    process.exit(1);
  });
}

module.exports = { app, startServer, createCrawlerMonitorRouter };
