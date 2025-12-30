'use strict';

/**
 * Rate Limit Dashboard Server
 * 
 * Express server at port 3120 providing:
 * - GET / - Main dashboard showing domain rate limits
 * - GET /api/domains - List all tracked domains with rate limits
 * - GET /api/domains/:domain - Get specific domain state
 * - POST /api/domains/:domain/reset - Reset domain to default interval
 * - POST /api/domains/:domain/interval - Set custom interval
 * - GET /api/metrics - Overall rate limit metrics
 * - GET /api/throttled - List throttled domains only
 * 
 * Usage:
 *   node src/ui/server/rateLimitDashboard/server.js
 *   Open http://localhost:3120
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { createRateLimitAdapter } = require('../../../db/sqlite/v1/rateLimitAdapter');
const { RateLimitTracker } = require('../../../crawler/RateLimitTracker');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');

const { RateLimitDashboard } = require('./views/RateLimitDashboard');
const { 
  DomainListPanel,
  DomainDetailCard,
  MetricsSummaryPanel,
  ThrottledDomainsPanel
} = require('./controls');

const PORT = process.env.PORT || 3120;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

// ─────────────────────────────────────────────────────────────
// Database & Services
// ─────────────────────────────────────────────────────────────

let db;
let rateLimitAdapter;
let rateLimitTracker;

async function initDb(dbPath = DB_PATH) {
  db = new Database(dbPath);
  rateLimitAdapter = createRateLimitAdapter(db);
  
  // Ensure table exists
  await rateLimitAdapter.ensureTable();
  
  // Create tracker with DB adapter
  rateLimitTracker = new RateLimitTracker({
    db: {
      getRateLimitAdapter: () => rateLimitAdapter
    },
    defaultIntervalMs: 1000,
    maxIntervalMs: 60000
  });
  
  // Initialize (load from DB)
  await rateLimitTracker.initialize();
  
  return { db, rateLimitAdapter, rateLimitTracker };
}

async function initRateLimitTracker({ dbHandle }) {
  const adapter = createRateLimitAdapter(dbHandle);
  await adapter.ensureTable();

  const tracker = new RateLimitTracker({
    db: {
      getRateLimitAdapter: () => adapter
    },
    defaultIntervalMs: 1000,
    maxIntervalMs: 60000
  });

  await tracker.initialize();
  return { adapter, tracker };
}

// ─────────────────────────────────────────────────────────────
// CSS Styles - WLILO Theme
// ─────────────────────────────────────────────────────────────

const DASHBOARD_CSS = `
  :root {
    --bg-leather: linear-gradient(135deg, #3d2b1f 0%, #2a1f17 50%, #1a1410 100%);
    --bg-obsidian: #1a1410;
    --bg-panel: linear-gradient(145deg, #2a1f17 0%, #1f1713 100%);
    --text-cream: #f5e6d3;
    --text-muted: #b8a090;
    --gold-accent: #d4a574;
    --gold-bright: #ffd700;
    --border-leather: #4a3628;
    --success-green: #4ade80;
    --warning-yellow: #fbbf24;
    --danger-red: #f87171;
    --font-serif: Georgia, 'Times New Roman', serif;
    --font-mono: 'Consolas', 'Monaco', monospace;
  }

  * { box-sizing: border-box; }

  body {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    margin: 0;
    padding: 0;
    background: var(--bg-obsidian);
    color: var(--text-cream);
    line-height: 1.6;
  }

  /* Hub Navigation */
  .hub-nav {
    background: var(--bg-panel);
    padding: 12px 32px;
    border-bottom: 1px solid var(--border-leather);
  }
  .hub-nav__link {
    color: var(--gold-accent);
    text-decoration: none;
    font-size: 14px;
  }
  .hub-nav__link:hover {
    color: var(--gold-bright);
    text-decoration: underline;
  }

  /* Header */
  .dashboard-header {
    background: var(--bg-panel);
    padding: 24px 32px;
    border-bottom: 2px solid var(--gold-accent);
  }

  .dashboard-header__title {
    margin: 0 0 4px 0;
    font-family: var(--font-serif);
    font-size: 28px;
    color: var(--gold-accent);
    letter-spacing: 0.5px;
  }

  .dashboard-header__subtitle {
    margin: 0;
    font-size: 14px;
    color: var(--text-muted);
  }

  /* Main layout */
  .dashboard-main {
    padding: 24px 32px;
    max-width: 1400px;
    margin: 0 auto;
  }

  /* Panels */
  .panel {
    background: var(--bg-panel);
    border: 1px solid var(--border-leather);
    border-radius: 8px;
    padding: 20px;
    margin-bottom: 24px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  }

  .panel__title {
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--gold-accent);
    margin: 0 0 16px 0;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border-leather);
  }

  /* Metrics row */
  .metrics-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 16px;
    margin-bottom: 24px;
  }

  .metric-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-leather);
    border-radius: 8px;
    padding: 16px;
    text-align: center;
  }

  .metric-card__value {
    font-size: 32px;
    font-weight: bold;
    color: var(--gold-accent);
    margin-bottom: 4px;
  }

  .metric-card__label {
    font-size: 12px;
    color: var(--text-muted);
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .metric-card--success .metric-card__value { color: var(--success-green); }
  .metric-card--warning .metric-card__value { color: var(--warning-yellow); }
  .metric-card--danger .metric-card__value { color: var(--danger-red); }

  /* Domain table */
  .domain-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .domain-table th {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-obsidian);
    color: var(--gold-accent);
    font-weight: 600;
    border-bottom: 2px solid var(--gold-accent);
    font-family: var(--font-serif);
  }

  .domain-table td {
    padding: 12px 16px;
    border-bottom: 1px solid var(--border-leather);
  }

  .domain-table tr:hover td {
    background: rgba(212, 165, 116, 0.1);
  }

  /* Domain name */
  .domain-name {
    font-family: var(--font-mono);
    color: var(--text-cream);
  }

  /* Interval badges */
  .interval-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 12px;
    font-weight: 600;
    font-family: var(--font-mono);
  }

  .interval-badge--normal {
    background: rgba(74, 222, 128, 0.2);
    color: var(--success-green);
    border: 1px solid var(--success-green);
  }

  .interval-badge--elevated {
    background: rgba(251, 191, 36, 0.2);
    color: var(--warning-yellow);
    border: 1px solid var(--warning-yellow);
  }

  .interval-badge--severe {
    background: rgba(248, 113, 113, 0.2);
    color: var(--danger-red);
    border: 1px solid var(--danger-red);
  }

  /* Action buttons */
  .btn {
    display: inline-block;
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .btn--reset {
    background: var(--gold-accent);
    color: var(--bg-obsidian);
  }

  .btn--reset:hover {
    background: var(--gold-bright);
  }

  .btn--danger {
    background: transparent;
    border: 1px solid var(--danger-red);
    color: var(--danger-red);
  }

  .btn--danger:hover {
    background: rgba(248, 113, 113, 0.2);
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 48px;
    color: var(--text-muted);
  }

  .empty-state__icon {
    font-size: 48px;
    margin-bottom: 16px;
    opacity: 0.5;
  }

  /* Throttled domains warning */
  .throttled-list {
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid var(--danger-red);
    border-radius: 8px;
    padding: 16px;
  }

  .throttled-list__item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-bottom: 1px solid rgba(248, 113, 113, 0.3);
  }

  .throttled-list__item:last-child {
    border-bottom: none;
  }
`;

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

function registerRateLimitDashboardRoutes(router, { getRateLimitTracker, includeRootRoute = true }) {
  // Get all domains with their rate limit states
  router.get('/api/domains', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      const states = tracker.getAllStates();
      const domains = Object.entries(states).map(([domain, state]) => ({
        domain,
        ...state,
        status: getIntervalStatus(state.currentIntervalMs)
      }));

      // Sort by interval descending (most throttled first)
      domains.sort((a, b) => b.currentIntervalMs - a.currentIntervalMs);

      res.json({ success: true, domains, count: domains.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get specific domain state
  router.get('/api/domains/:domain', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      const state = tracker.getDomainState(req.params.domain);
      if (!state) {
        return res.status(404).json({ success: false, error: 'Domain not found' });
      }
      res.json({
        success: true,
        domain: req.params.domain,
        ...state,
        status: getIntervalStatus(state.currentIntervalMs)
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Reset domain to default interval
  router.post('/api/domains/:domain/reset', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      tracker.resetDomain(req.params.domain);
      await tracker.persist();
      res.json({ success: true, message: `Reset ${req.params.domain}` });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Set custom interval for domain
  router.post('/api/domains/:domain/interval', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      const { intervalMs } = req.body;
      if (!intervalMs || typeof intervalMs !== 'number') {
        return res.status(400).json({ success: false, error: 'intervalMs required (number)' });
      }

      tracker.setInterval(req.params.domain, intervalMs);
      await tracker.persist();

      const state = tracker.getDomainState(req.params.domain);
      res.json({
        success: true,
        domain: req.params.domain,
        newInterval: state.currentIntervalMs
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get overall metrics
  router.get('/api/metrics', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      const metrics = tracker.getMetrics();
      const throttled = tracker.getThrottledDomains();

      res.json({
        success: true,
        metrics: {
          ...metrics,
          throttledCount: throttled.length
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get throttled domains only
  router.get('/api/throttled', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      const throttled = tracker.getThrottledDomains();
      res.json({ success: true, domains: throttled, count: throttled.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Persist to database
  router.post('/api/persist', async (req, res) => {
    try {
      const tracker = getRateLimitTracker();
      if (!tracker) {
        return res.status(503).json({ success: false, error: 'Rate limit tracker not initialized' });
      }

      await tracker.persist();
      res.json({ success: true, message: 'Persisted to database' });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  if (includeRootRoute) {
    // SSR Main Dashboard
    router.get('/', async (req, res) => {
      try {
        const tracker = getRateLimitTracker();
        if (!tracker) {
          res.status(503).type('html').send('<h1>Rate Limit Dashboard</h1><p>Initializing…</p>');
          return;
        }

        const metrics = tracker.getMetrics();
        const states = tracker.getAllStates();
        const throttled = tracker.getThrottledDomains();

        // Convert states to array for rendering
        const domains = Object.entries(states)
          .map(([domain, state]) => ({
            domain,
            ...state,
            status: getIntervalStatus(state.currentIntervalMs)
          }))
          .sort((a, b) => b.currentIntervalMs - a.currentIntervalMs);

        const dashboard = new RateLimitDashboard({
          metrics,
          domains,
          throttled
        });

        const html = renderPage(dashboard, 'Rate Limit Dashboard');
        res.send(html);
      } catch (err) {
        console.error('[RateLimitDashboard] Render error:', err);
        res.status(500).send(`<pre>Error: ${err.message}\n${err.stack}</pre>`);
      }
    });
  }
}

registerRateLimitDashboardRoutes(app, {
  getRateLimitTracker: () => rateLimitTracker
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

function getIntervalStatus(intervalMs) {
  if (intervalMs <= 1000) return 'normal';
  if (intervalMs <= 5000) return 'elevated';
  return 'severe';
}

function renderPage(control, title) {
  const rendered = control.all_html_render();
  
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
  <style>${DASHBOARD_CSS}</style>
</head>
<body>
  ${rendered}
  <script>
    // Auto-refresh every 30 seconds
    setTimeout(() => location.reload(), 30000);
  </script>
</body>
</html>`;
}

async function createRateLimitDashboardRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle,
    getDbRW,
    includeRootRoute = true
  } = options;

  const resolved = resolveBetterSqliteHandle({
    dbPath,
    readonly: false,
    getDbHandle,
    getDbRW
  });

  if (!resolved.dbHandle) {
    throw new Error('createRateLimitDashboardRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const { tracker } = await initRateLimitTracker({ dbHandle: resolved.dbHandle });

  const router = express.Router();
  router.use(express.json());
  registerRateLimitDashboardRoutes(router, {
    getRateLimitTracker: () => tracker,
    includeRootRoute
  });

  return { router, close: resolved.close };
}

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  initDb().then(() => {
    wrapServerForCheck(app, PORT, undefined, () => {
      console.log(`[RateLimitDashboard] Server running at http://localhost:${PORT}`);
    });
  }).catch(err => {
    console.error('[RateLimitDashboard] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, initDb, PORT, createRateLimitDashboardRouter };
