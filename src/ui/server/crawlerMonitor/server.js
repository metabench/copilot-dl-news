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
 * - WebSocket endpoint for near-instant live updates
 * 
 * Usage:
 *   node src/ui/server/crawlerMonitor/server.js
 *   Open http://localhost:3008
 * 
 * Endpoints:
 *   GET /           - Dashboard HTML
 *   GET /api/metrics - Current metrics (JSON)
 *   GET /api/metrics/stream - SSE stream (legacy)
 *   GET /api/workers - Worker list
 *   GET /api/queue   - Queue stats
 *   GET /api/errors  - Recent errors
 *   GET /api/domains - Domain stats
 *   WS  /ws          - WebSocket live updates
 * 
 * @module src/ui/server/crawlerMonitor/server
 */

const express = require('express');
const jsgui = require('jsgui3-html');
const WebSocket = require('ws');

const { WorkerRegistry, DomainLockManager, WorkDistributor } = require('../../../core/crawler/coordinator');
const { CrawlerMetricsService } = require('../../../core/crawler/metrics');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');

// Extracted controls
const { MetricCardsControl, el } = require('./controls/MetricCardsControl');
const { ThroughputChartControl } = require('./controls/ThroughputChartControl');
const { WorkerListControl } = require('./controls/WorkerListControl');
const { LocksListControl } = require('./controls/LocksListControl');
const { ErrorsListControl } = require('./controls/ErrorsListControl');
const DASHBOARD_CSS = require('./styles');
const { buildClientScript } = require('./client-script');

const PORT = process.env.CRAWLER_MONITOR_PORT || process.env.PORT || 3008;

// ─────────────────────────────────────────────────────────────────
// Components
// ─────────────────────────────────────────────────────────────────

/** @type {WorkerRegistry} */
let registry;
/** @type {DomainLockManager} */
let lockManager;
/** @type {CrawlerMetricsService} */
let metricsService;

// SSE clients (legacy)
const sseClients = new Set();
// WebSocket clients
const wsClients = new Set();

let componentsInitialized = false;

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

  // Forward metrics to SSE and WebSocket clients
  metricsService.on('metrics', async (metrics) => {
    // SSE (legacy)
    const sseData = JSON.stringify(metrics);
    for (const client of sseClients) {
      client.write(`data: ${sseData}\n\n`);
    }

    // WebSocket — broadcast metrics + supplementary data
    if (wsClients.size > 0) {
      const wsMetrics = JSON.stringify({ type: 'metrics', data: metrics });
      for (const ws of wsClients) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(wsMetrics);
        }
      }

      // Periodically send workers/locks/errors (every metrics tick)
      try {
        const [workers, locks] = await Promise.all([
          registry.getWorkers(),
          lockManager.getLocks()
        ]);
        const errors = metricsService.getRecentErrors(10);

        const batch = [
          { type: 'workers', data: workers },
          { type: 'locks', data: locks },
          { type: 'errors', data: errors }
        ];

        for (const msg of batch) {
          const json = JSON.stringify(msg);
          for (const ws of wsClients) {
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(json);
            }
          }
        }
      } catch (_) {
        // Non-fatal: dashboard will still have metric cards
      }
    }
  });

  // Add demo data if requested
  if (process.env.CRAWLER_MONITOR_DEMO === '1') {
    await addDemoData();
  }
}

async function addDemoData() {
  await registry.register({
    id: 'worker-1', hostname: 'crawler-node-1', pid: 12345,
    metadata: { version: '1.0.0' }, capabilities: { maxConcurrency: 10 }
  });
  await registry.register({
    id: 'worker-2', hostname: 'crawler-node-2', pid: 23456,
    metadata: { version: '1.0.0' }, capabilities: { maxConcurrency: 10 }
  });
  await lockManager.acquire({ domain: 'example.com', workerId: 'worker-1', reason: 'crawling' });
  await lockManager.acquire({ domain: 'news.ycombinator.com', workerId: 'worker-2', reason: 'crawling' });
  metricsService.recordVisit({ url: 'https://example.com/', workerId: 'worker-1', duration: 150, statusCode: 200 });
  metricsService.recordError({ url: 'https://flaky-site.com/page', workerId: 'worker-1', error: 'ECONNRESET', message: 'Connection reset by peer' });
}

// ─────────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────────

function renderPage(title, content) {
  const ctx = new jsgui.Page_Context();
  const page = new jsgui.Standard_Web_Page({ context: ctx });

  const titleEl = el(ctx, 'title');
  titleEl.add(title);
  page.head.add(titleEl);

  const meta = new jsgui.Control({ context: ctx, tagName: 'meta' });
  meta.dom.attributes.charset = 'UTF-8';
  page.head.add(meta);

  const style = el(ctx, 'style');
  style.add(DASHBOARD_CSS);
  page.head.add(style);

  // WebSocket client script (replaces old SSE + reload)
  const script = el(ctx, 'script');
  script.add(buildClientScript());
  page.head.add(script);

  // Header
  const header = el(ctx, 'header', 'header');
  const h1 = el(ctx, 'h1');
  const titleSpan = el(ctx, 'span');
  titleSpan.add('\uD83D\uDD77\uFE0F Crawler Monitor');
  h1.add(titleSpan);

  // WebSocket status indicator
  const wsStatus = el(ctx, 'span', 'ws-status');
  const wsDot = el(ctx, 'span', 'ws-dot connecting');
  wsDot.dom.attributes.id = 'ws-dot';
  wsStatus.add(wsDot);
  const wsText = el(ctx, 'span');
  wsText.dom.attributes.id = 'ws-text';
  wsText.add('Connecting…');
  wsStatus.add(wsText);
  h1.add(wsStatus);

  header.add(h1);
  page.body.add(header);

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

    container.add(new MetricCardsControl({ context: ctx, metrics }));

    const row = el(ctx, 'div', 'row');
    const left = el(ctx, 'div');
    left.add(new ThroughputChartControl({ context: ctx, history }));
    left.add(new WorkerListControl({ context: ctx, workers }));
    row.add(left);

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

// API: SSE stream (legacy, kept for backwards compatibility)
app.get('/api/metrics/stream', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('Access-Control-Allow-Origin', '*');
  sseClients.add(res);
  const metrics = metricsService.getMetrics();
  res.write(`data: ${JSON.stringify(metrics)}\n\n`);
  req.on('close', () => { sseClients.delete(res); });
});

// API: Worker list
app.get('/api/workers', async (req, res) => {
  const workers = await registry.getWorkers();
  res.json(workers);
});

// API: Queue stats
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

// API: Recent errors
app.get('/api/errors', (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const errors = metricsService.getRecentErrors(limit);
  res.json(errors);
});

// API: Locks list
app.get('/api/locks', async (req, res) => {
  const locks = await lockManager.getLocks();
  res.json(locks);
});

// API: Domain stats
app.get('/api/domains', async (req, res) => {
  const locks = await lockManager.getLocks();
  res.json(locks);
});

// API: History
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
// WebSocket setup
// ─────────────────────────────────────────────────────────────────

function attachWebSocket(httpServer) {
  const wss = new WebSocket.Server({ server: httpServer, path: '/ws' });

  wss.on('connection', async (ws) => {
    wsClients.add(ws);

    // Send full initial state immediately
    try {
      const [metrics, workers, locks] = await Promise.all([
        metricsService.getMetrics(),
        registry.getWorkers(),
        lockManager.getLocks()
      ]);
      const errors = metricsService.getRecentErrors(10);

      ws.send(JSON.stringify({
        type: 'full_state',
        data: { metrics, workers, locks, errors }
      }));
    } catch (_) {
      // Non-fatal
    }

    ws.on('close', () => { wsClients.delete(ws); });
    ws.on('error', () => { wsClients.delete(ws); });
  });

  return wss;
}

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

  // Attach WebSocket to the HTTP server
  attachWebSocket(server);

  return server;
}

async function createCrawlerMonitorRouter() {
  await initComponents();

  return {
    router: app,
    attachWebSocket,
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
