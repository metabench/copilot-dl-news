'use strict';

/**
 * Scheduler Dashboard (Unified App module)
 *
 * Minimal observability surface for scheduler reconciliation:
 * - crawl_schedules stats (due counts)
 * - recent scheduler reconcile runs (task_events)
 *
 * Standalone usage:
 *   node src/ui/server/schedulerDashboard/server.js
 *   Open http://localhost:3135
 */

const express = require('express');
const path = require('path');

const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');
const scheduleAdapter = require('../../../db/sqlite/v1/queries/scheduleAdapter');

const PORT = process.env.PORT || 3135;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function safeJsonParse(payload) {
  if (!payload) return null;
  try {
    return JSON.parse(payload);
  } catch {
    return null;
  }
}

function queryScheduleStats(dbHandle) {
  try {
    return scheduleAdapter.getScheduleStats(dbHandle);
  } catch (err) {
    return { error: err.message };
  }
}

function queryReconcileRuns(dbHandle, limit = 20) {
  try {
    const stmt = dbHandle.prepare(`
      SELECT
        task_id,
        task_type,
        MIN(ts) as first_ts,
        MAX(ts) as last_ts,
        SUM(CASE WHEN event_type = 'scheduler:reconcile:postpone' THEN 1 ELSE 0 END) as postponed,
        SUM(CASE WHEN event_type = 'scheduler:reconcile:start' THEN 1 ELSE 0 END) as starts,
        SUM(CASE WHEN event_type = 'scheduler:reconcile:end' THEN 1 ELSE 0 END) as ends
      FROM task_events
      WHERE task_type = 'scheduler'
        AND task_id LIKE 'scheduler-reconcile-%'
      GROUP BY task_id
      ORDER BY MAX(ts) DESC
      LIMIT ?
    `);

    return stmt.all(limit);
  } catch (err) {
    // task_events might not exist yet; keep UI resilient.
    return { error: err.message, items: [] };
  }
}

function queryReconcileEvents(dbHandle, taskId, limit = 200) {
  try {
    const stmt = dbHandle.prepare(`
      SELECT seq, ts, event_type, event_category, severity, scope, target, payload
      FROM task_events
      WHERE task_id = ?
      ORDER BY seq
      LIMIT ?
    `);

    return stmt.all(taskId, limit).map(row => ({
      ...row,
      payloadJson: safeJsonParse(row.payload)
    }));
  } catch (err) {
    return { error: err.message, items: [] };
  }
}

function renderHtml({ stats, runs }) {
  const style = `
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: #0b0a09; color: #f5e6d3; }
    .wrap { padding: 22px 24px; }
    h1 { margin: 0 0 14px 0; font-size: 22px; }
    .sub { color: #b8a090; margin-bottom: 18px; }
    .cards { display: flex; gap: 12px; flex-wrap: wrap; margin-bottom: 18px; }
    .card { border: 1px solid rgba(212,165,116,0.22); background: rgba(212,165,116,0.08); border-radius: 10px; padding: 12px 14px; min-width: 160px; }
    .label { color: #b8a090; font-size: 12px; }
    .value { font-size: 18px; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 10px; border-bottom: 1px solid rgba(212,165,116,0.16); text-align: left; }
    th { color: #d4a574; font-weight: 600; font-size: 12px; letter-spacing: 0.03em; }
    a { color: #f0c777; text-decoration: none; }
    a:hover { text-decoration: underline; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #f0c777; }
    .muted { color: #8f7c6f; }
    .error { color: #ff8f8f; margin: 12px 0; }
  `;

  const statsError = stats && stats.error ? `<div class="error">Schedule stats unavailable: <code>${stats.error}</code></div>` : '';
  const statsCards = stats && !stats.error ? `
    <div class="cards">
      <div class="card"><div class="label">Total domains</div><div class="value">${stats.totalDomains ?? 0}</div></div>
      <div class="card"><div class="label">Due domains</div><div class="value">${stats.dueDomains ?? 0}</div></div>
      <div class="card"><div class="label">Total crawls</div><div class="value">${(stats.totalSuccesses ?? 0) + (stats.totalFailures ?? 0)}</div></div>
      <div class="card"><div class="label">Total articles</div><div class="value">${stats.totalArticles ?? 0}</div></div>
    </div>
  ` : '';

  const runsError = runs && runs.error ? `<div class="error">task_events query failed: <code>${runs.error}</code></div>` : '';
  const runItems = Array.isArray(runs) ? runs : (runs && runs.items) || [];

  const runsTable = runItems.length === 0
    ? `<div class="muted">No scheduler reconcile runs recorded yet.\n<br/>Emit events by calling <code>CrawlScheduler.reconcileOverdue({ taskEventWriter: new TaskEventWriter(db) })</code>.</div>`
    : `
      <table>
        <thead>
          <tr>
            <th>Task</th>
            <th>First</th>
            <th>Last</th>
            <th>Postponed</th>
          </tr>
        </thead>
        <tbody>
          ${runItems.map(row => `
            <tr>
              <td><a href="/scheduler/run/${encodeURIComponent(row.task_id)}">${row.task_id}</a></td>
              <td class="muted">${row.first_ts || ''}</td>
              <td class="muted">${row.last_ts || ''}</td>
              <td>${row.postponed || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Scheduler</title>
      <style>${style}</style>
    </head>
    <body>
      <div class="wrap">
        <h1>🗓️ Scheduler</h1>
        <div class="sub">Schedules + reconciliation observability (what/why).</div>
        ${statsError}
        ${statsCards}

        <h2 style="margin: 18px 0 10px 0; font-size: 16px;">Recent reconcile runs</h2>
        ${runsError}
        ${runsTable}
      </div>
    </body>
  </html>`;
}

function renderRunHtml({ taskId, events }) {
  const style = `
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial; background: #0b0a09; color: #f5e6d3; }
    .wrap { padding: 22px 24px; }
    a { color: #f0c777; text-decoration: none; }
    a:hover { text-decoration: underline; }
    h1 { margin: 0 0 14px 0; font-size: 20px; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 10px 10px; border-bottom: 1px solid rgba(212,165,116,0.16); text-align: left; vertical-align: top; }
    th { color: #d4a574; font-weight: 600; font-size: 12px; letter-spacing: 0.03em; }
    code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; color: #f0c777; }
    pre { margin: 0; white-space: pre-wrap; word-break: break-word; }
    .muted { color: #8f7c6f; }
    .error { color: #ff8f8f; margin: 12px 0; }
  `;

  const items = Array.isArray(events) ? events : (events && events.items) || [];
  const error = events && events.error ? `<div class="error">Event query failed: <code>${events.error}</code></div>` : '';

  const body = items.length === 0
    ? `<div class="muted">No events found for this run.</div>`
    : `
      <table>
        <thead>
          <tr>
            <th>Seq</th>
            <th>TS</th>
            <th>Type</th>
            <th>Payload</th>
          </tr>
        </thead>
        <tbody>
          ${items.map(e => `
            <tr>
              <td class="muted">${e.seq}</td>
              <td class="muted">${e.ts}</td>
              <td><code>${e.event_type}</code></td>
              <td><pre>${JSON.stringify(e.payloadJson || safeJsonParse(e.payload) || {}, null, 2)}</pre></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;

  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>Scheduler Run</title>
      <style>${style}</style>
    </head>
    <body>
      <div class="wrap">
        <div style="margin-bottom: 14px;"><a href="/scheduler">← Back</a></div>
        <h1>🧾 Reconcile Run</h1>
        <div class="muted" style="margin-bottom: 14px;"><code>${taskId}</code></div>
        ${error}
        ${body}
      </div>
    </body>
  </html>`;
}

function createSchedulerDashboardRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    readonly = true,
    includeRootRoute = true,
    getDbHandle,
    getDbRW
  } = options;

  const resolved = resolveBetterSqliteHandle({ dbPath, readonly, getDbHandle, getDbRW });
  const { dbHandle } = resolved;

  const router = express.Router();

  router.get('/api/schedule-stats', (req, res) => {
    const stats = queryScheduleStats(dbHandle);
    res.json({ status: 'ok', stats });
  });

  router.get('/api/reconcile-runs', (req, res) => {
    const limitRaw = req.query && req.query.limit != null ? Number(req.query.limit) : 20;
    const limit = Number.isFinite(limitRaw) ? Math.max(1, Math.min(200, Math.trunc(limitRaw))) : 20;
    const runs = queryReconcileRuns(dbHandle, limit);
    res.json({ status: 'ok', runs });
  });

  router.get('/api/reconcile-runs/:taskId/events', (req, res) => {
    const taskId = req.params.taskId;
    const events = queryReconcileEvents(dbHandle, taskId);
    res.json({ status: 'ok', taskId, events });
  });

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      const stats = queryScheduleStats(dbHandle);
      const runs = queryReconcileRuns(dbHandle, 20);
      res.type('html').send(renderHtml({ stats, runs }));
    });

    router.get('/run/:taskId', (req, res) => {
      const taskId = req.params.taskId;
      const events = queryReconcileEvents(dbHandle, taskId);
      res.type('html').send(renderRunHtml({ taskId, events }));
    });
  }

  return {
    router,
    close: () => {
      try {
        resolved.close();
      } catch {
        // ignore
      }
    }
  };
}

// Standalone runner
if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'SchedulerDashboard';
  const app = express();

  const moduleApi = createSchedulerDashboardRouter({ dbPath: process.env.DB_PATH || DB_PATH, includeRootRoute: true, readonly: true });
  app.use('/', moduleApi.router);

  wrapServerForCheck(app, Number(PORT) || 3135, undefined, () => {
    console.log(`\n🗓️  Scheduler Dashboard running at http://localhost:${PORT}\n`);
  });

  const shutdown = () => {
    try {
      moduleApi.close();
    } catch {
      // ignore
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { createSchedulerDashboardRouter };
