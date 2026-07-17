'use strict';

/**
 * Crawl Observer Server — View and analyze crawl events from task_events table
 * 
 * Usage:
 *   node src/ui/server/crawlObserver/server.js
 *   Open http://localhost:3007
 */

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');
const { createMcpLogger } = require("../../../shared/utils/mcpLogger");
const { spawn } = require('child_process');

const log = createMcpLogger.uiServer('crawl-observer');
const { createCrawlObserverUiQueries } = require('news-crawler-db');

const { TaskListControl } = require('./controls/TaskListControl');
const { TaskDetailControl } = require('./controls/TaskDetailControl');
const { TelemetryDashboardControl } = require('./controls/TelemetryDashboardControl');
const RemoteCrawlControl = require('./controls/RemoteCrawlControl');

const DEFAULT_PORT = Number(process.env.PORT) || 3007;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function resolvePortFromArgv(defaultPort) {
  const portIndex = process.argv.indexOf("--port");
  if (portIndex === -1) return defaultPort;

  const value = process.argv[portIndex + 1];
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultPort;
  return parsed;
}

const PORT = resolvePortFromArgv(DEFAULT_PORT);

// ─────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────

let db;
let closeDb = () => {};
let queries;

function initDb(options = {}) {
  const dbPath = options.dbPath || DB_PATH;
  const resolved = resolveBetterSqliteHandle({
    dbPath,
    readonly: true,
    getDbHandle: options.getDbHandle,
    getDbRW: options.getDbRW
  });

  db = resolved.dbHandle;
  closeDb = resolved.close;
  queries = createCrawlObserverUiQueries(db);

  return {
    close: () => {
      try {
        closeDb();
      } catch {
        // ignore
      }
    }
  };
}

// ─────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────

function text(ctx, str) {
  return new jsgui.Text_Node({ context: ctx, text: String(str) });
}

function makeEl(ctx, tagName, cssClass) {
  const el = new jsgui.Control({ context: ctx, tagName });
  if (cssClass) el.set('class', cssClass);
  return el;
}

function joinBasePath(basePath, routePath) {
  const base = basePath ? String(basePath) : '';
  const p = routePath ? String(routePath) : '';

  if (!base) return p || '/';
  if (p === '/') return base + '/';
  if (!p) return base;
  return base + p;
}

function renderPage(ctx, title, content, options = {}) {
  const page = new jsgui.Standard_Web_Page({ context: ctx });
  const basePath = options.basePath ? String(options.basePath) : '';

  const titleEl = makeEl(ctx, 'title');
  titleEl.add(text(ctx, title));
  page.head.add(titleEl);

  const meta = makeEl(ctx, 'meta');
  meta.dom.attributes.charset = 'UTF-8';
  page.head.add(meta);

  const styleEl = makeEl(ctx, 'style');
  styleEl.add(text(ctx, `
      body { 
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 0;
        background: #1a1a2e;
        color: #eee;
      }
      a { color: #7ec8e3; }
      a:hover { text-decoration: underline; }
      .nav { background: #16213e; padding: 12px 16px; margin-bottom: 16px; }
      .nav a { margin-right: 20px; text-decoration: none; }
      .nav a:hover { text-decoration: underline; }
    `));
  page.head.add(styleEl);

  // Navigation bar
  const nav = makeEl(ctx, 'nav', 'nav');
  const tasksLink = nav.add(new jsgui.a({ context: ctx }));
  tasksLink.set('href', joinBasePath(basePath, '/'));
  tasksLink.add(text(ctx, '📋 Tasks'));

  const telemetryLink = nav.add(new jsgui.a({ context: ctx }));
  telemetryLink.set('href', joinBasePath(basePath, '/telemetry'));
  telemetryLink.add(text(ctx, '📈 Telemetry'));

  const remoteLink = nav.add(new jsgui.a({ context: ctx }));
  remoteLink.set('href', joinBasePath(basePath, '/remote-control'));
  remoteLink.add(text(ctx, '🚀 Remote Control'));

  page.body.add(nav);

  if (content && typeof content.compose === 'function') {
    content.compose();
  }
  page.body.add(content);

  return page.all_html_render();
}

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

const app = express();

app.get('/', (req, res) => {
  const taskType = req.query.type || null;
  const limit = parseInt(req.query.limit, 10) || 50;

  const tasks = queries.listTasks({ taskType, limit });

  const ctx = new jsgui.Page_Context();
  const basePath = String(req.baseUrl || '');
  const control = new TaskListControl({ context: ctx, tasks, basePath });

  res.send(renderPage(ctx, 'Crawl Observer', control, { basePath }));
});

app.get('/task/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 200, 1), 500);
  const afterSeq = req.query.afterSeq === undefined ? null : Number(req.query.afterSeq);
  const beforeSeq = req.query.beforeSeq === undefined ? null : Number(req.query.beforeSeq);

  const summary = queries.getTaskSummary(taskId);
  const page = queries.getTaskEventsPage(taskId, { limit, afterSeq, beforeSeq });
  const events = page.events;
  const pageInfo = page.pageInfo;

  const problems = queries.getTaskProblems(taskId, { limit: 50 });
  const timeline = queries.getTaskTimeline(taskId);

  const ctx = new jsgui.Page_Context();
  const basePath = String(req.baseUrl || '');
  const control = new TaskDetailControl({ 
    context: ctx, 
    taskId, 
    summary, 
    events, 
    problems, 
    timeline,
    pageInfo,
    basePath
  });

  res.send(renderPage(ctx, `Task: ${taskId}`, control, { basePath }));
});

// API endpoints
app.get('/api/tasks', (req, res) => {
  const taskType = req.query.type || null;
  const limit = parseInt(req.query.limit, 10) || 50;

  res.json(queries.listTasks({ taskType, limit }));
});

app.get('/api/task/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 500, 1), 1000);
  const sinceSeq = req.query.sinceSeq === undefined ? null : Number(req.query.sinceSeq);
  const includePayload = String(req.query.includePayload || '') === '1';

  res.json(queries.getTaskApiBundle(taskId, { limit, sinceSeq, includePayload }));
});

// Incremental events endpoint for live polling
app.get('/api/task/:taskId/events', (req, res) => {
  const taskId = req.params.taskId;
  const parsedLimit = parseInt(req.query.limit, 10);
  const limit = Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 200, 1), 1000);
  const sinceSeq = req.query.sinceSeq === undefined ? null : Number(req.query.sinceSeq);
  const includePayload = String(req.query.includePayload || '') === '1';

  res.json(queries.getIncrementalEvents(taskId, {
    limit,
    sinceSeq,
    includePayload,
    eventType: req.query.eventType,
    category: req.query.category,
    severity: req.query.severity,
    scope: req.query.scope
  }));
});

// Server-Sent Events (SSE) endpoint for real-time telemetry
app.get('/api/task/:taskId/stream', (req, res) => {
  const taskId = req.params.taskId;
  const includePayload = String(req.query.includePayload || '') === '1';

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  let lastSeq = Number(req.query.sinceSeq || 0) || 0;

  const intervalId = setInterval(() => {
    try {
      const data = queries.getIncrementalEvents(taskId, {
        limit: 500,
        sinceSeq: lastSeq,
        includePayload,
      });

      if (data.events && data.events.length > 0) {
        data.events.forEach(ev => {
          lastSeq = Math.max(lastSeq, Number(ev.seq || 0));
        });
        res.write(`data: ${JSON.stringify(data.events)}\n\n`);
      }
    } catch (err) {
      log.error('SSE Error:', err);
    }
  }, 500); // 500ms real-time loop

  req.on('close', () => {
    clearInterval(intervalId);
  });
});

app.get('/telemetry', (req, res) => {
  const stats = queries.getTelemetryStats();
  const ctx = new jsgui.Page_Context();
  const basePath = String(req.baseUrl || '');
  const control = new TelemetryDashboardControl({ context: ctx, stats, basePath });
  res.send(renderPage(ctx, 'Telemetry Dashboard', control, { basePath }));
});

app.get('/api/telemetry', (req, res) => {
  res.json(queries.getTelemetryStats());
});

app.get('/remote-control', (req, res) => {
  const ctx = new jsgui.Page_Context();
  const basePath = String(req.baseUrl || '');
  const control = new RemoteCrawlControl({ context: ctx, basePath });
  res.send(renderPage(ctx, 'Remote Control', control, { basePath }));
});

app.post('/api/crawl/spawn', express.json(), (req, res) => {
  const { domains, profile } = req.body;
  if (!domains && !profile) {
    return res.status(400).json({ error: 'Must provide either domains or profile' });
  }

  const args = ['tools/crawl/crawl-remote.js', 'collect'];
  if (domains) {
    args.push('--domains', domains);
  }
  if (profile) {
    args.push('--profile', profile);
  }

  try {
    const cp = spawn('node', args, {
      stdio: 'ignore', // run detached without tying up IO
      detached: true,
      cwd: path.resolve(__dirname, '../../../../') // repo root
    });
    cp.unref();

    log.info('Spawned remote crawl', { pid: cp.pid, args });
    res.json({ success: true, pid: cp.pid, message: 'Crawl process spawned successfully' });
  } catch (err) {
    log.error('Failed to spawn remote crawl', { error: err.message });
    res.status(500).json({ error: err.message });
  }
});

// ─────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'CrawlObserver';
  log.info('Starting crawl observer', { port: PORT, db: DB_PATH });
  const lifecycle = initDb();

  const server = wrapServerForCheck(app, PORT, undefined, () => {
    log.info('Crawl observer ready', { url: `http://localhost:${PORT}`, db: DB_PATH });
    console.log(`\n🔍 Crawl Observer running at http://localhost:${PORT}`);
    console.log(`   Database: ${DB_PATH}\n`);
  });

  process.on('SIGINT', () => {
    log.info('Shutting down crawl observer (SIGINT)');
    console.log('\nShutting down...');
    try {
      server.close();
    } catch {
      // ignore
    }
    lifecycle.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    log.info('Shutting down crawl observer (SIGTERM)');
    try {
      server.close();
    } catch {
      // ignore
    }
    lifecycle.close();
    process.exit(0);
  });
}

async function createCrawlObserverRouter(options = {}) {
  const lifecycle = initDb(options);
  return { router: app, close: lifecycle.close };
}

module.exports = { app, initDb, createCrawlObserverRouter };

