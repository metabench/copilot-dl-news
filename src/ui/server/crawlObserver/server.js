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
const { TaskEventWriter } = require('../../../db/TaskEventWriter');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');

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
let eventWriter;
let closeDb = () => {};

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
  eventWriter = new TaskEventWriter(db, { batchWrites: false, createTable: false });

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
// jsgui3 Controls
// ─────────────────────────────────────────────────────────────

class TaskListControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._tasks = spec.tasks || [];
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { padding: '16px' }
    }));

    container.add(new jsgui.Control({
      context: this.context,
      tagName: 'h2',
      text: '📋 Task Events'
    }));

    if (this._tasks.length === 0) {
      container.add(new jsgui.Control({
        context: this.context,
        tagName: 'p',
        text: 'No tasks found. Run a crawl to see events here.',
        style: { color: '#666', fontStyle: 'italic' }
      }));
      return;
    }

    const table = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'table',
      style: { 
        width: '100%', 
        borderCollapse: 'collapse',
        fontSize: '14px'
      }
    }));

    // Header
    const thead = table.add(new jsgui.Control({ context: this.context, tagName: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));
    ['Type', 'Task ID', 'Events', 'Errors', 'Warnings', 'Started', 'Duration', ''].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        tagName: 'th',
        text: h,
        style: { 
          textAlign: 'left', 
          padding: '8px', 
          borderBottom: '2px solid #ddd',
          background: '#f5f5f5'
        }
      }));
    });

    // Body
    const tbody = table.add(new jsgui.Control({ context: this.context, tagName: 'tbody' }));
    for (const task of this._tasks) {
      const row = tbody.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));
      
      // Type
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.task_type,
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      // Task ID (linked)
      const idCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      idCell.add(new jsgui.Control({
        context: this.context,
        tagName: 'a',
        text: task.task_id.length > 40 ? task.task_id.slice(0, 37) + '...' : task.task_id,
        attr: { href: `/task/${encodeURIComponent(task.task_id)}` },
        style: { color: '#0066cc', textDecoration: 'none' }
      }));

      // Events
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: String(task.event_count),
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      // Errors
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.error_count > 0 ? `❌ ${task.error_count}` : '✓',
        style: { 
          padding: '8px', 
          borderBottom: '1px solid #eee',
          color: task.error_count > 0 ? '#c00' : '#090'
        }
      }));

      // Warnings
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: task.warn_count > 0 ? `⚠️ ${task.warn_count}` : '-',
        style: { 
          padding: '8px', 
          borderBottom: '1px solid #eee',
          color: task.warn_count > 0 ? '#c60' : '#999'
        }
      }));

      // Started
      const startDate = task.first_ts ? new Date(task.first_ts) : null;
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: startDate ? startDate.toLocaleString() : '-',
        style: { padding: '8px', borderBottom: '1px solid #eee', fontSize: '12px' }
      }));

      // Duration
      let duration = '-';
      if (task.first_ts && task.last_ts) {
        const ms = new Date(task.last_ts) - new Date(task.first_ts);
        if (ms < 1000) duration = `${ms}ms`;
        else if (ms < 60000) duration = `${(ms / 1000).toFixed(1)}s`;
        else duration = `${(ms / 60000).toFixed(1)}m`;
      }
      row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        text: duration,
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));

      // Actions
      const actionsCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { padding: '8px', borderBottom: '1px solid #eee' }
      }));
      actionsCell.add(new jsgui.Control({
        context: this.context,
        tagName: 'a',
        text: '🔍 View',
        attr: { href: `/task/${encodeURIComponent(task.task_id)}` },
        style: { marginRight: '8px', color: '#0066cc', textDecoration: 'none' }
      }));
    }
  }
}

class TaskDetailControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._taskId = spec.taskId;
    this._summary = spec.summary || {};
    this._events = spec.events || [];
    this._problems = spec.problems || [];
    this._timeline = spec.timeline || [];
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { padding: '16px' }
    }));

    // Header
    const header = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { marginBottom: '24px' }
    }));
    
    header.add(new jsgui.Control({
      context: this.context,
      el: 'a',
      text: '← Back to list',
      attr: { href: '/' },
      style: { color: '#0066cc', textDecoration: 'none', marginBottom: '8px', display: 'block' }
    }));
    
    header.add(new jsgui.Control({
      context: this.context,
      el: 'h2',
      text: `🕷️ ${this._taskId}`
    }));

    // Summary cards
    this._renderSummary(container);

    // Problems section
    if (this._problems.length > 0) {
      this._renderProblems(container);
    }

    // Timeline section
    if (this._timeline.length > 0) {
      this._renderTimeline(container);
    }

    // Events table
    this._renderEvents(container);
  }

  _renderSummary(container) {
    const s = this._summary;
    const grid = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }
    }));

    const cards = [
      { label: 'Task Type', value: s.task_type || '-', icon: '📋' },
      { label: 'Total Events', value: s.total_events || 0, icon: '📊' },
      { label: 'Errors', value: s.error_count || 0, icon: '❌', bad: s.error_count > 0 },
      { label: 'Warnings', value: s.warn_count || 0, icon: '⚠️', bad: s.warn_count > 0 },
      { label: 'Unique Scopes', value: s.unique_scopes || 0, icon: '🌐' }
    ];

    for (const card of cards) {
      const cardEl = grid.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: { 
          background: card.bad ? '#fff0f0' : '#f9f9f9',
          padding: '16px',
          borderRadius: '8px',
          border: card.bad ? '1px solid #fcc' : '1px solid #eee'
        }
      }));
      cardEl.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        text: `${card.icon} ${card.label}`,
        style: { fontSize: '12px', color: '#666', marginBottom: '4px' }
      }));
      cardEl.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        text: String(card.value),
        style: { fontSize: '24px', fontWeight: 'bold', color: card.bad ? '#c00' : '#333' }
      }));
    }
  }

  _renderProblems(container) {
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: `❌ Problems (${this._problems.length})`,
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    const list = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { marginBottom: '24px' }
    }));

    for (const p of this._problems.slice(0, 20)) {
      const item = list.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: { 
          background: p.severity === 'error' ? '#fff0f0' : '#fffbe6',
          padding: '12px',
          borderRadius: '4px',
          marginBottom: '8px',
          borderLeft: `4px solid ${p.severity === 'error' ? '#c00' : '#f90'}`
        }
      }));
      
      item.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        text: `[${p.seq}] ${p.event_type}`,
        style: { fontWeight: 'bold', marginBottom: '4px' }
      }));

      if (p.target) {
        item.add(new jsgui.Control({
          context: this.context,
          el: 'div',
          text: p.target.length > 80 ? p.target.slice(0, 77) + '...' : p.target,
          style: { fontSize: '12px', color: '#666', wordBreak: 'break-all' }
        }));
      }

      if (p.payload) {
        try {
          const data = JSON.parse(p.payload);
          if (data.error || data.message) {
            item.add(new jsgui.Control({
              context: this.context,
              el: 'div',
              text: data.error || data.message,
              style: { fontSize: '12px', color: '#900', marginTop: '4px' }
            }));
          }
        } catch { /* ignore */ }
      }
    }
  }

  _renderTimeline(container) {
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '📍 Timeline',
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    const timeline = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { 
        borderLeft: '2px solid #0066cc',
        paddingLeft: '20px',
        marginBottom: '24px'
      }
    }));

    for (const e of this._timeline) {
      const item = timeline.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: { 
          position: 'relative',
          marginBottom: '16px'
        }
      }));

      // Dot
      item.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: { 
          position: 'absolute',
          left: '-26px',
          top: '4px',
          width: '10px',
          height: '10px',
          borderRadius: '50%',
          background: '#0066cc'
        }
      }));

      item.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        text: e.event_type,
        style: { fontWeight: 'bold' }
      }));

      const ts = e.ts ? new Date(e.ts).toLocaleString() : '-';
      item.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        text: ts,
        style: { fontSize: '12px', color: '#666' }
      }));

      if (e.scope) {
        item.add(new jsgui.Control({
          context: this.context,
          el: 'div',
          text: e.scope,
          style: { fontSize: '12px', color: '#0066cc' }
        }));
      }
    }
  }

  _renderEvents(container) {
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: `📊 Events (${this._events.length})`,
      style: { marginTop: '24px', marginBottom: '12px' }
    }));

    const table = container.add(new jsgui.Control({
      context: this.context,
      el: 'table',
      style: { 
        width: '100%', 
        borderCollapse: 'collapse',
        fontSize: '13px'
      }
    }));

    // Header
    const thead = table.add(new jsgui.Control({ context: this.context, el: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, el: 'tr' }));
    ['Seq', 'Time', 'Type', '', 'Scope', 'Target', 'Duration'].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        el: 'th',
        text: h,
        style: { 
          textAlign: 'left', 
          padding: '6px', 
          borderBottom: '2px solid #ddd',
          background: '#f5f5f5'
        }
      }));
    });

    // Body
    const tbody = table.add(new jsgui.Control({ context: this.context, el: 'tbody' }));
    for (const e of this._events) {
      const row = tbody.add(new jsgui.Control({ context: this.context, el: 'tr' }));
      
      const severityIcon = e.severity === 'error' ? '❌' : e.severity === 'warn' ? '⚠️' : '';
      const rowStyle = { padding: '6px', borderBottom: '1px solid #eee' };
      if (e.severity === 'error') rowStyle.background = '#fff0f0';
      else if (e.severity === 'warn') rowStyle.background = '#fffbe6';

      row.add(new jsgui.Control({ context: this.context, el: 'td', text: String(e.seq), style: rowStyle }));
      
      const ts = e.ts ? new Date(e.ts).toLocaleTimeString() : '-';
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: ts, style: { ...rowStyle, fontSize: '11px' } }));
      
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: e.event_type, style: rowStyle }));
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: severityIcon, style: rowStyle }));
      
      const scope = e.scope ? (e.scope.length > 25 ? e.scope.slice(0, 22) + '...' : e.scope) : '-';
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: scope, style: { ...rowStyle, fontSize: '11px' } }));
      
      const target = e.target ? (e.target.length > 40 ? e.target.slice(0, 37) + '...' : e.target) : '-';
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: target, style: { ...rowStyle, fontSize: '11px' } }));
      
      let dur = '-';
      if (e.duration_ms) {
        dur = e.duration_ms < 1000 ? `${e.duration_ms}ms` : `${(e.duration_ms / 1000).toFixed(1)}s`;
      }
      row.add(new jsgui.Control({ context: this.context, el: 'td', text: dur, style: rowStyle }));
    }
  }
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

function renderPage(ctx, title, content) {
  const page = new jsgui.Standard_Web_Page({ context: ctx });

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
  tasksLink.set('href', '/');
  tasksLink.add(text(ctx, '📋 Tasks'));

  const telemetryLink = nav.add(new jsgui.a({ context: ctx }));
  telemetryLink.set('href', '/telemetry');
  telemetryLink.add(text(ctx, '📈 Telemetry'));

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

  let sql = `
    SELECT 
      task_type,
      task_id,
      COUNT(*) as event_count,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count
    FROM task_events
  `;
  const params = [];
  if (taskType) {
    sql += ' WHERE task_type = ?';
    params.push(taskType);
  }
  sql += ' GROUP BY task_id ORDER BY MAX(ts) DESC LIMIT ?';
  params.push(limit);

  const tasks = db.prepare(sql).all(...params);

  const ctx = new jsgui.Page_Context();
  const control = new TaskListControl({ context: ctx, tasks });

  res.send(renderPage(ctx, 'Crawl Observer', control));
});

app.get('/task/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  const limit = parseInt(req.query.limit, 10) || 200;

  // Get summary
  const summary = db.prepare(`
    SELECT 
      COUNT(*) as total_events,
      MAX(seq) as max_seq,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      task_type,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count,
      COUNT(DISTINCT scope) as unique_scopes
    FROM task_events WHERE task_id = ?
  `).get(taskId);

  // Get events
  const events = db.prepare(`
    SELECT * FROM task_events WHERE task_id = ? ORDER BY seq LIMIT ?
  `).all(taskId, limit);

  // Get problems
  const problems = db.prepare(`
    SELECT seq, ts, event_type, severity, scope, target, payload
    FROM task_events 
    WHERE task_id = ? AND severity IN ('error', 'warn')
    ORDER BY seq LIMIT 50
  `).all(taskId);

  // Get timeline
  const timeline = db.prepare(`
    SELECT seq, ts, event_type, scope, duration_ms
    FROM task_events 
    WHERE task_id = ? AND event_category = 'lifecycle'
    ORDER BY seq
  `).all(taskId);

  const ctx = new jsgui.Page_Context();
  const control = new TaskDetailControl({ 
    context: ctx, 
    taskId, 
    summary, 
    events, 
    problems, 
    timeline 
  });

  res.send(renderPage(ctx, `Task: ${taskId}`, control));
});

// API endpoints
app.get('/api/tasks', (req, res) => {
  const taskType = req.query.type || null;
  const limit = parseInt(req.query.limit, 10) || 50;

  let sql = `
    SELECT 
      task_type,
      task_id,
      COUNT(*) as event_count,
      MIN(ts) as first_ts,
      MAX(ts) as last_ts,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      SUM(CASE WHEN severity = 'warn' THEN 1 ELSE 0 END) as warn_count
    FROM task_events
  `;
  const params = [];
  if (taskType) {
    sql += ' WHERE task_type = ?';
    params.push(taskType);
  }
  sql += ' GROUP BY task_id ORDER BY MAX(ts) DESC LIMIT ?';
  params.push(limit);

  res.json(db.prepare(sql).all(...params));
});

app.get('/api/task/:taskId', (req, res) => {
  const taskId = req.params.taskId;
  const events = eventWriter.getEvents(taskId, { limit: 500 });
  const summary = eventWriter.getSummary(taskId);
  const problems = eventWriter.getProblems(taskId, 100);
  const timeline = eventWriter.getTimeline(taskId);

  res.json({ taskId, summary, problems, timeline, events });
});

// ─────────────────────────────────────────────────────────────
// Telemetry Dashboard
// ─────────────────────────────────────────────────────────────

/**
 * Get aggregated telemetry from task_events
 */
function getTelemetryStats() {
  // Recent crawl stats (last 24h)
  const recentCrawls = db.prepare(`
    SELECT 
      COUNT(DISTINCT task_id) as crawl_count,
      SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as total_urls,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as error_count,
      AVG(duration_ms) as avg_duration_ms
    FROM task_events
    WHERE ts > datetime('now', '-24 hours')
      AND task_type = 'crawl'
  `).get();

  // Per-hour breakdown
  const hourlyStats = db.prepare(`
    SELECT 
      strftime('%Y-%m-%d %H:00', ts) as hour,
      COUNT(DISTINCT task_id) as crawl_count,
      SUM(CASE WHEN event_type = 'crawl:url:batch' THEN item_count ELSE 0 END) as urls_fetched,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
    FROM task_events
    WHERE ts > datetime('now', '-24 hours')
      AND task_type = 'crawl'
    GROUP BY hour
    ORDER BY hour DESC
    LIMIT 24
  `).all();

  // Error breakdown by type
  const errorBreakdown = db.prepare(`
    SELECT 
      event_type,
      COUNT(*) as count,
      MAX(ts) as last_seen
    FROM task_events
    WHERE severity = 'error'
      AND ts > datetime('now', '-7 days')
    GROUP BY event_type
    ORDER BY count DESC
    LIMIT 10
  `).all();

  // Domain performance
  const domainStats = db.prepare(`
    SELECT 
      scope as domain,
      COUNT(*) as fetch_count,
      AVG(duration_ms) as avg_ms,
      SUM(CASE WHEN severity = 'error' THEN 1 ELSE 0 END) as errors
    FROM task_events
    WHERE event_type = 'crawl:url:batch'
      AND ts > datetime('now', '-24 hours')
      AND scope IS NOT NULL
    GROUP BY scope
    ORDER BY fetch_count DESC
    LIMIT 20
  `).all();

  return { recentCrawls, hourlyStats, errorBreakdown, domainStats };
}

class TelemetryDashboardControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._stats = spec.stats || {};
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { padding: '16px' }
    }));

    // Header
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h2',
      text: '📈 Crawl Telemetry Dashboard'
    }));

    // Summary cards
    const cardRow = container.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { 
        display: 'grid', 
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', 
        gap: '16px',
        marginBottom: '24px'
      }
    }));

    const recent = this._stats.recentCrawls || {};
    this._addCard(cardRow, '🕷️ Crawls (24h)', recent.crawl_count || 0);
    this._addCard(cardRow, '🔗 URLs Fetched', recent.total_urls || 0);
    this._addCard(cardRow, '❌ Errors', recent.error_count || 0, recent.error_count > 0 ? '#c44' : null);
    this._addCard(cardRow, '⏱️ Avg Duration', `${Math.round(recent.avg_duration_ms || 0)}ms`);

    // Hourly chart section
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '📊 Hourly Activity (Last 24h)',
      style: { marginTop: '24px' }
    }));

    this._addHourlyChart(container);

    // Error breakdown
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '🚨 Error Breakdown (7 days)',
      style: { marginTop: '24px' }
    }));

    this._addErrorTable(container);

    // Domain stats
    container.add(new jsgui.Control({
      context: this.context,
      el: 'h3',
      text: '🌐 Domain Performance (24h)',
      style: { marginTop: '24px' }
    }));

    this._addDomainTable(container);
  }

  _addCard(parent, label, value, bgColor) {
    const card = parent.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: {
        background: bgColor || '#2a3a5a',
        padding: '16px',
        borderRadius: '8px',
        textAlign: 'center'
      }
    }));
    card.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      text: String(value),
      style: { fontSize: '28px', fontWeight: 'bold', marginBottom: '4px' }
    }));
    card.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      text: label,
      style: { fontSize: '12px', color: '#aaa' }
    }));
  }

  _addHourlyChart(parent) {
    const hours = this._stats.hourlyStats || [];
    if (hours.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: 'No data available',
        style: { color: '#666' }
      }));
      return;
    }

    const maxUrls = Math.max(...hours.map(h => h.urls_fetched || 0), 1);
    const chartWrap = parent.add(new jsgui.Control({
      context: this.context,
      el: 'div',
      style: { 
        display: 'flex', 
        gap: '2px', 
        alignItems: 'flex-end',
        height: '120px',
        background: '#1a2a4a',
        padding: '8px',
        borderRadius: '4px'
      }
    }));

    for (const h of hours.slice().reverse()) {
      const height = Math.max(4, Math.round((h.urls_fetched / maxUrls) * 100));
      const bar = chartWrap.add(new jsgui.Control({
        context: this.context,
        el: 'div',
        style: {
          flex: '1',
          height: `${height}%`,
          background: h.errors > 0 ? '#c44' : '#4a9',
          borderRadius: '2px 2px 0 0',
          minWidth: '8px'
        },
        attributes: { title: `${h.hour}: ${h.urls_fetched} URLs, ${h.errors} errors` }
      }));
    }
  }

  _addErrorTable(parent) {
    const errors = this._stats.errorBreakdown || [];
    if (errors.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: '✅ No errors in the last 7 days!',
        style: { color: '#4a9' }
      }));
      return;
    }

    const table = parent.add(new jsgui.Control({
      context: this.context,
      el: 'table',
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, el: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, el: 'tr' }));
    ['Event Type', 'Count', 'Last Seen'].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        el: 'th',
        text: h,
        style: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #444' }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, el: 'tbody' }));
    for (const err of errors) {
      const row = tbody.add(new jsgui.Control({ context: this.context, el: 'tr' }));
      [err.event_type, err.count, err.last_seen].forEach((val, i) => {
        row.add(new jsgui.Control({
          context: this.context,
          el: 'td',
          text: String(val),
          style: { padding: '8px', borderBottom: '1px solid #333', color: i === 1 ? '#c44' : '#ccc' }
        }));
      });
    }
  }

  _addDomainTable(parent) {
    const domains = this._stats.domainStats || [];
    if (domains.length === 0) {
      parent.add(new jsgui.Control({
        context: this.context,
        el: 'p',
        text: 'No domain data available',
        style: { color: '#666' }
      }));
      return;
    }

    const table = parent.add(new jsgui.Control({
      context: this.context,
      el: 'table',
      style: { width: '100%', borderCollapse: 'collapse', fontSize: '14px' }
    }));

    const thead = table.add(new jsgui.Control({ context: this.context, el: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, el: 'tr' }));
    ['Domain', 'Fetches', 'Avg (ms)', 'Errors'].forEach(h => {
      headerRow.add(new jsgui.Control({
        context: this.context,
        el: 'th',
        text: h,
        style: { textAlign: 'left', padding: '8px', borderBottom: '1px solid #444' }
      }));
    });

    const tbody = table.add(new jsgui.Control({ context: this.context, el: 'tbody' }));
    for (const d of domains) {
      const row = tbody.add(new jsgui.Control({ context: this.context, el: 'tr' }));
      [
        d.domain || '(unknown)',
        d.fetch_count,
        Math.round(d.avg_ms || 0),
        d.errors
      ].forEach((val, i) => {
        row.add(new jsgui.Control({
          context: this.context,
          el: 'td',
          text: String(val),
          style: { 
            padding: '8px', 
            borderBottom: '1px solid #333',
            color: i === 3 && val > 0 ? '#c44' : '#ccc'
          }
        }));
      });
    }
  }
}

app.get('/telemetry', (req, res) => {
  const stats = getTelemetryStats();
  const ctx = new jsgui.Page_Context();
  const control = new TelemetryDashboardControl({ context: ctx, stats });
  res.send(renderPage(ctx, 'Telemetry Dashboard', control));
});

app.get('/api/telemetry', (req, res) => {
  res.json(getTelemetryStats());
});

// ─────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'CrawlObserver';
  const lifecycle = initDb();

  const server = wrapServerForCheck(app, PORT, undefined, () => {
    console.log(`\n🔍 Crawl Observer running at http://localhost:${PORT}`);
    console.log(`   Database: ${DB_PATH}\n`);
  });

  process.on('SIGINT', () => {
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
