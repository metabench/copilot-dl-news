'use strict';

/**
 * Query Telemetry Dashboard — View query cost data and planning metrics
 * 
 * Usage:
 *   node src/ui/server/queryTelemetry/server.js
 *   Open http://localhost:3020
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');
const { getQueryStats, getRecentQueries } = require('../../../data/db/queryTelemetry');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');

const PORT = process.env.PORT || 3020;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

// ─────────────────────────────────────────────────────────────
// Database setup
// ─────────────────────────────────────────────────────────────

let db;

function initDb(dbPath = DB_PATH, options = {}) {
  if (options.dbHandle) {
    db = options.dbHandle;
    return;
  }
  db = new Database(dbPath, { readonly: true });
}

function createQueryTelemetryRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle
  } = options;

  if (typeof getDbHandle === 'function') {
    initDb(dbPath, { dbHandle: getDbHandle() });
  } else {
    initDb(dbPath);
  }

  return { router: app };
}

// ─────────────────────────────────────────────────────────────
// Helper: jsgui SSR utilities
// ─────────────────────────────────────────────────────────────

function text(ctx, str) {
  return new jsgui.Text_Node({ context: ctx, text: str });
}

// Create element for tags that don't exist in jsgui3-html
function makeEl(ctx, tagName, cssClass) {
  const el = new jsgui.Control({ context: ctx, tagName });
  if (cssClass) el.set('class', cssClass);
  return el;
}

// Convert style object to CSS string
function styleStr(obj) {
  return Object.entries(obj)
    .map(([k, v]) => {
      const cssKey = k.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
      return `${cssKey}:${v}`;
    })
    .join(';');
}

// Set inline style on element
function setStyle(el, styleObj) {
  el.dom.attributes.style = styleStr(styleObj);
  return el;
}

// ─────────────────────────────────────────────────────────────
// jsgui3 Controls
// ─────────────────────────────────────────────────────────────

/**
 * QueryStatsTable: Displays aggregated query statistics
 */
class QueryStatsTable extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._stats = spec.stats || [];
    this._sortBy = spec.sortBy || 'avg_duration_ms';
    this._complexityFilter = spec.complexityFilter || null;
  }

  compose() {
    const ctx = this.context;
    const container = this.add(new jsgui.div({ context: ctx }));
    setStyle(container, { marginBottom: '24px' });

    const h3 = container.add(new jsgui.h3({ context: ctx }));
    h3.add(text(ctx, `📊 Query Statistics (${this._stats.length} types)`));
    setStyle(h3, { marginBottom: '12px', color: '#eee' });

    if (this._stats.length === 0) {
      const p = container.add(new jsgui.p({ context: ctx }));
      p.add(text(ctx, 'No query telemetry data available. Run some queries to see statistics here.'));
      setStyle(p, { color: '#888', fontStyle: 'italic' });
      return;
    }

    // Filter controls
    const filterRow = container.add(new jsgui.div({ context: ctx }));
    setStyle(filterRow, { marginBottom: '12px', display: 'flex', gap: '16px' });

    const filters = [
      { text: '🔄 Refresh', href: '/', active: false },
      { text: 'All', href: '/', active: this._complexityFilter === null },
      { text: 'Simple', href: '/?complexity=simple', active: this._complexityFilter === 'simple' },
      { text: 'Complex', href: '/?complexity=complex', active: this._complexityFilter === 'complex' }
    ];

    for (const f of filters) {
      const a = filterRow.add(new jsgui.a({ context: ctx }));
      a.set('href', f.href);
      a.add(text(ctx, f.text));
      setStyle(a, { color: f.active ? '#fff' : '#7ec8e3', textDecoration: 'none' });
    }

    const table = container.add(new jsgui.table({ context: ctx }));
    setStyle(table, { width: '100%', borderCollapse: 'collapse', fontSize: '14px' });

    // Header
    const thead = table.add(new jsgui.thead({ context: ctx }));
    const headerRow = thead.add(new jsgui.tr({ context: ctx }));
    
    const headers = [
      { key: 'query_type', label: 'Query Type' },
      { key: 'operation', label: 'Operation' },
      { key: 'avg_duration_ms', label: 'Avg (ms)' },
      { key: 'min_duration_ms', label: 'Min' },
      { key: 'max_duration_ms', label: 'Max' },
      { key: 'avg_result_count', label: 'Avg Results' },
      { key: 'sample_count', label: 'Samples' },
      { key: 'query_complexity', label: 'Complexity' }
    ];

    for (const h of headers) {
      const isSorted = this._sortBy === h.key;
      const th = headerRow.add(makeEl(ctx, 'th'));
      th.add(text(ctx, isSorted ? `${h.label} ▼` : h.label));
      setStyle(th, { 
        textAlign: 'left', 
        padding: '8px', 
        borderBottom: '2px solid #444',
        background: '#1a2a4a',
        color: isSorted ? '#7ec8e3' : '#ccc',
        cursor: 'pointer'
      });
    }

    // Body
    const tbody = table.add(makeEl(ctx, 'tbody'));
    
    for (const stat of this._stats) {
      const row = tbody.add(new jsgui.tr({ context: ctx }));
      const avgMs = Math.round(stat.avg_duration_ms || 0);
      
      // Color code by duration
      let durationColor = '#4a9'; // green <100ms
      if (avgMs >= 500) durationColor = '#c44'; // red >=500ms
      else if (avgMs >= 100) durationColor = '#f90'; // yellow 100-500ms

      const cells = [
        { value: stat.query_type, style: { fontWeight: 'bold' } },
        { value: stat.operation || '-', style: {} },
        { value: avgMs, style: { color: durationColor, fontWeight: 'bold' } },
        { value: Math.round(stat.min_duration_ms || 0), style: {} },
        { value: Math.round(stat.max_duration_ms || 0), style: {} },
        { value: Math.round(stat.avg_result_count || 0), style: {} },
        { value: stat.sample_count || 0, style: {} },
        { value: stat.query_complexity || 'simple', style: {} }
      ];

      for (const cell of cells) {
        const td = row.add(new jsgui.td({ context: ctx }));
        td.add(text(ctx, String(cell.value)));
        setStyle(td, { 
          padding: '8px', 
          borderBottom: '1px solid #333',
          color: '#ccc',
          ...cell.style
        });
      }
    }
  }
}

/**
 * RecentQueriesPanel: Displays recent queries with color-coded durations
 */
class RecentQueriesPanel extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._queries = spec.queries || [];
    this._queryType = spec.queryType || null;
    this._availableTypes = spec.availableTypes || [];
  }

  compose() {
    const ctx = this.context;
    const container = this.add(new jsgui.div({ context: ctx }));
    setStyle(container, { marginBottom: '24px' });

    const h3 = container.add(new jsgui.h3({ context: ctx }));
    h3.add(text(ctx, `📝 Recent Queries (${this._queries.length})`));
    setStyle(h3, { marginBottom: '12px', color: '#eee' });

    // Type filter
    if (this._availableTypes.length > 0) {
      const filterRow = container.add(new jsgui.div({ context: ctx }));
      setStyle(filterRow, { marginBottom: '12px', display: 'flex', gap: '8px', flexWrap: 'wrap' });

      const filterLabel = filterRow.add(new jsgui.span({ context: ctx }));
      filterLabel.add(text(ctx, 'Filter: '));
      setStyle(filterLabel, { color: '#888' });

      const allLink = filterRow.add(new jsgui.a({ context: ctx }));
      allLink.set('href', '/recent');
      allLink.add(text(ctx, 'All'));
      setStyle(allLink, { 
        color: this._queryType === null ? '#fff' : '#7ec8e3', 
        textDecoration: 'none',
        padding: '2px 8px',
        background: this._queryType === null ? '#2a4a6a' : 'transparent',
        borderRadius: '4px'
      });

      for (const type of this._availableTypes.slice(0, 10)) {
        const isActive = this._queryType === type;
        const typeLink = filterRow.add(new jsgui.a({ context: ctx }));
        typeLink.set('href', `/recent?queryType=${encodeURIComponent(type)}`);
        typeLink.add(text(ctx, type));
        setStyle(typeLink, { 
          color: isActive ? '#fff' : '#7ec8e3', 
          textDecoration: 'none',
          padding: '2px 8px',
          background: isActive ? '#2a4a6a' : 'transparent',
          borderRadius: '4px'
        });
      }
    }

    if (this._queries.length === 0) {
      const p = container.add(new jsgui.p({ context: ctx }));
      p.add(text(ctx, this._queryType 
        ? `No recent queries of type "${this._queryType}".`
        : 'No recent queries found.'));
      setStyle(p, { color: '#888', fontStyle: 'italic' });
      return;
    }

    const list = container.add(new jsgui.div({ context: ctx }));
    setStyle(list, { display: 'flex', flexDirection: 'column', gap: '4px' });

    for (const q of this._queries) {
      const durationMs = q.duration_ms || 0;
      
      // Color code by duration
      let bgColor = '#1a3a2a'; // green <100ms
      let borderColor = '#2a5a3a';
      if (durationMs >= 500) {
        bgColor = '#3a1a1a'; // red >=500ms
        borderColor = '#5a2a2a';
      } else if (durationMs >= 100) {
        bgColor = '#3a2a1a'; // yellow 100-500ms
        borderColor = '#5a4a2a';
      }

      const item = list.add(new jsgui.div({ context: ctx }));
      setStyle(item, { 
        background: bgColor,
        borderLeft: `3px solid ${borderColor}`,
        padding: '8px 12px',
        borderRadius: '0 4px 4px 0',
        display: 'flex',
        gap: '16px',
        alignItems: 'center'
      });

      // Duration badge
      const durationSpan = item.add(new jsgui.span({ context: ctx }));
      durationSpan.add(text(ctx, `${durationMs}ms`));
      setStyle(durationSpan, { 
        fontWeight: 'bold',
        minWidth: '60px',
        color: durationMs >= 500 ? '#f66' : durationMs >= 100 ? '#fa0' : '#6f6'
      });

      // Query type
      const typeSpan = item.add(new jsgui.span({ context: ctx }));
      typeSpan.add(text(ctx, q.query_type));
      setStyle(typeSpan, { color: '#7ec8e3', minWidth: '120px' });

      // Operation
      const opSpan = item.add(new jsgui.span({ context: ctx }));
      opSpan.add(text(ctx, q.operation || '-'));
      setStyle(opSpan, { color: '#aaa', flex: '1' });

      // Result count
      const countSpan = item.add(new jsgui.span({ context: ctx }));
      countSpan.add(text(ctx, `${q.result_count || 0} rows`));
      setStyle(countSpan, { color: '#888', fontSize: '12px' });

      // Complexity badge
      if (q.query_complexity === 'complex') {
        const complexSpan = item.add(new jsgui.span({ context: ctx }));
        complexSpan.add(text(ctx, '🔥 complex'));
        setStyle(complexSpan, { color: '#f90', fontSize: '11px' });
      }
    }
  }
}

/**
 * CostModelSummary: Shows QueryCostEstimatorPlugin model stats
 */
class CostModelSummary extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._stats = spec.stats || [];
  }

  compose() {
    const ctx = this.context;
    const container = this.add(new jsgui.div({ context: ctx }));
    setStyle(container, { marginBottom: '24px' });

    const h3 = container.add(new jsgui.h3({ context: ctx }));
    h3.add(text(ctx, '💰 Cost Model Summary'));
    setStyle(h3, { marginBottom: '12px', color: '#eee' });

    // Calculate summary stats
    const totalSamples = this._stats.reduce((sum, s) => sum + (s.sample_count || 0), 0);
    const highCostOps = this._stats.filter(s => (s.avg_duration_ms || 0) >= 500).length;
    const avgDuration = this._stats.length > 0
      ? Math.round(this._stats.reduce((sum, s) => sum + (s.avg_duration_ms || 0), 0) / this._stats.length)
      : 0;

    const cardRow = container.add(new jsgui.div({ context: ctx }));
    setStyle(cardRow, { 
      display: 'grid', 
      gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', 
      gap: '12px'
    });

    const cards = [
      { label: 'Total Samples', value: totalSamples, icon: '📊' },
      { label: 'Query Types', value: this._stats.length, icon: '🔖' },
      { label: 'Avg Duration', value: `${avgDuration}ms`, icon: '⏱️' },
      { label: 'High-Cost Ops', value: highCostOps, icon: '🔥', warn: highCostOps > 0 }
    ];

    for (const card of cards) {
      const cardEl = cardRow.add(new jsgui.div({ context: ctx }));
      setStyle(cardEl, {
        background: card.warn ? '#3a2a2a' : '#2a3a4a',
        padding: '12px',
        borderRadius: '8px',
        textAlign: 'center'
      });
      
      const valueDiv = cardEl.add(new jsgui.div({ context: ctx }));
      valueDiv.add(text(ctx, String(card.value)));
      setStyle(valueDiv, { fontSize: '24px', fontWeight: 'bold', color: card.warn ? '#f66' : '#fff' });
      
      const labelDiv = cardEl.add(new jsgui.div({ context: ctx }));
      labelDiv.add(text(ctx, `${card.icon} ${card.label}`));
      setStyle(labelDiv, { fontSize: '11px', color: '#888', marginTop: '4px' });
    }
  }
}

// ─────────────────────────────────────────────────────────────
// Page rendering
// ─────────────────────────────────────────────────────────────

/**
 * Build page structure with the given controls.
 * @param {jsgui.Page_Context} ctx - The shared page context
 * @param {string} title - Page title
 * @param {jsgui.Control|jsgui.Control[]} controls - Control(s) to add to the page body
 * @returns {string} Full HTML document
 */
function renderPage(ctx, title, controls) {
  // Build raw HTML elements
  const htmlEl = new jsgui.html({ context: ctx });
  const headEl = htmlEl.add(new jsgui.head({ context: ctx }));
  const bodyEl = htmlEl.add(new jsgui.body({ context: ctx }));
  
  // Title
  const titleEl = headEl.add(new jsgui.title({ context: ctx }));
  titleEl.add(text(ctx, title));

  // Style
  const styleEl = new jsgui.Control({ context: ctx, tagName: 'style' });
  styleEl.add(new jsgui.String_Control({ context: ctx, text: `
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
      .container { padding: 16px; max-width: 1400px; margin: 0 auto; }
    ` }));
  headEl.add(styleEl);

  // Navigation bar
  const nav = bodyEl.add(makeEl(ctx, 'nav', 'nav'));
  
  const navLinks = [
    { href: '/', label: '📊 Stats' },
    { href: '/recent', label: '📝 Recent' },
    { href: '/api/stats', label: '🔌 API: Stats' },
    { href: '/api/recent', label: '🔌 API: Recent' }
  ];
  
  for (const link of navLinks) {
    const a = nav.add(new jsgui.a({ context: ctx }));
    a.set('href', link.href);
    a.add(text(ctx, link.label));
  }

  // Header container
  const header = bodyEl.add(new jsgui.div({ context: ctx }));
  header.set('class', 'container');

  const h1 = header.add(new jsgui.h1({ context: ctx }));
  h1.add(text(ctx, '📈 Query Telemetry Dashboard'));
  setStyle(h1, { marginBottom: '8px' });

  const subtitle = header.add(new jsgui.p({ context: ctx }));
  subtitle.add(text(ctx, 'Query cost data for cost-aware hub ranking and planning optimization.'));
  setStyle(subtitle, { color: '#888', marginBottom: '24px' });

  // Add controls container
  const container = bodyEl.add(new jsgui.div({ context: ctx }));
  container.set('class', 'container');

  const controlList = Array.isArray(controls) ? controls : [controls];
  for (const control of controlList) {
    // Explicitly invoke compose() so the control builds its DOM
    if (typeof control.compose === 'function') {
      control.compose();
    }
    container.add(control);
  }

  return '<!DOCTYPE html>' + htmlEl.all_html_render();
}

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

const app = express();

// Main dashboard - Query Stats
app.get('/', (req, res) => {
  const complexityFilter = req.query.complexity || null;
  
  const stats = getQueryStats(db, { 
    complexity: complexityFilter, 
    limit: 100 
  });

  const ctx = new jsgui.Page_Context();
  
  const controls = [
    new CostModelSummary({ context: ctx, stats }),
    new QueryStatsTable({ 
      context: ctx, 
      stats,
      sortBy: 'avg_duration_ms',
      complexityFilter 
    })
  ];

  res.send(renderPage(ctx, 'Query Telemetry Dashboard', controls));
});

// Recent queries page
app.get('/recent', (req, res) => {
  const queryType = req.query.queryType || null;
  
  // Get available query types for filter
  const allStats = getQueryStats(db, { limit: 100 });
  const availableTypes = [...new Set(allStats.map(s => s.query_type))].filter(Boolean);
  
  // Get recent queries (need to fetch from DB directly since getRecentQueries needs a type)
  let queries = [];
  if (queryType) {
    queries = getRecentQueries(db, queryType, 50);
  } else {
    // Get recent across all types
    try {
      queries = db.prepare(`
        SELECT id, query_type, operation, duration_ms, result_count, query_complexity, host, job_id
        FROM query_telemetry
        ORDER BY id DESC
        LIMIT 50
      `).all();
    } catch (err) {
      console.warn('[queryTelemetry] Failed to fetch recent queries:', err.message);
      queries = [];
    }
  }

  const ctx = new jsgui.Page_Context();
  
  const controls = [
    new RecentQueriesPanel({ 
      context: ctx, 
      queries,
      queryType,
      availableTypes
    })
  ];

  res.send(renderPage(ctx, 'Recent Queries', controls));
});

// API: Get query statistics
app.get('/api/stats', (req, res) => {
  const queryType = req.query.queryType || null;
  const complexity = req.query.complexity || null;
  const limit = parseInt(req.query.limit, 10) || 100;

  const stats = getQueryStats(db, { queryType, complexity, limit });
  
  // Calculate summary
  const totalSamples = stats.reduce((sum, s) => sum + (s.sample_count || 0), 0);
  const highCostOps = stats.filter(s => (s.avg_duration_ms || 0) >= 500);

  res.json({
    stats,
    summary: {
      queryTypeCount: stats.length,
      totalSamples,
      highCostOperationCount: highCostOps.length,
      highCostOperations: highCostOps.map(s => ({
        queryType: s.query_type,
        operation: s.operation,
        avgDurationMs: Math.round(s.avg_duration_ms)
      }))
    }
  });
});

// API: Get recent queries
app.get('/api/recent', (req, res) => {
  const queryType = req.query.queryType || null;
  const limit = parseInt(req.query.limit, 10) || 50;

  let queries = [];
  if (queryType) {
    queries = getRecentQueries(db, queryType, limit);
  } else {
    try {
      queries = db.prepare(`
        SELECT id, query_type, operation, duration_ms, result_count, query_complexity, host, job_id
        FROM query_telemetry
        ORDER BY id DESC
        LIMIT ?
      `).all(limit);
    } catch (err) {
      console.warn('[queryTelemetry] Failed to fetch recent queries:', err.message);
      queries = [];
    }
  }

  res.json({
    queries,
    count: queries.length,
    queryType: queryType || 'all'
  });
});

// ─────────────────────────────────────────────────────────────
// Server startup
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  initDb();

  wrapServerForCheck(app, PORT, undefined, () => {
    console.log(`\n📈 Query Telemetry Dashboard running at http://localhost:${PORT}`);
    console.log(`   Database: ${DB_PATH}`);
    console.log(`\n   API Endpoints:`);
    console.log(`   - GET /api/stats     Query statistics`);
    console.log(`   - GET /api/recent    Recent queries`);
    console.log('');
  });

  process.on('SIGINT', () => {
    console.log('\nShutting down...');
    if (db) db.close();
    process.exit(0);
  });
}

module.exports = { app, initDb, createQueryTelemetryRouter };

