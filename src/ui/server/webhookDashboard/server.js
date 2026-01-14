'use strict';

/**
 * Webhook Management Dashboard Server
 * 
 * Express server at port 3121 providing:
 * - GET / - Main dashboard showing all webhooks
 * - GET /webhooks/new - Create webhook form
 * - POST /webhooks - Create new webhook
 * - GET /webhooks/:id - Webhook detail page
 * - PUT /webhooks/:id - Update webhook
 * - DELETE /webhooks/:id - Delete webhook
 * - POST /webhooks/:id/test - Send test webhook
 * - GET /webhooks/:id/deliveries - Delivery history
 * - GET /api/* - JSON API endpoints
 * 
 * Usage:
 *   node src/ui/server/webhookDashboard/server.js
 *   Open http://localhost:3121
 */

const express = require('express');
const path = require('path');
const Database = require('better-sqlite3');
const jsgui = require('jsgui3-html');

const { createIntegrationAdapter } = require('../../../data/db/sqlite/v1/queries/integrationAdapter');
const { WebhookService, EVENT_TYPES } = require('../../../integrations/WebhookService');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { resolveBetterSqliteHandle } = require('../utils/serverStartupCheckdashboardModule');

const { WebhookDashboard } = require('./views/WebhookDashboard');

const PORT = process.env.PORT || 3121;
const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    port: Number(process.env.PORT) || Number(PORT) || 3121,
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

    if (token === '--db-path' && argv[i + 1]) {
      i += 1;
      args.dbPath = argv[i];
      continue;
    }
  }

  return args;
}

// ─────────────────────────────────────────────────────────────
// Database & Services
// ─────────────────────────────────────────────────────────────

let db;
let integrationAdapter;
let webhookService;

async function initDb(dbPath = DB_PATH) {
  db = new Database(dbPath);
  
  // Create a wrapped DB that works with async/await
  const wrappedDb = {
    run: (sql, params = []) => {
      const stmt = db.prepare(sql);
      const result = stmt.run(...params);
      return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
    },
    get: (sql, params = []) => {
      const stmt = db.prepare(sql);
      return Promise.resolve(stmt.get(...params));
    },
    all: (sql, params = []) => {
      const stmt = db.prepare(sql);
      return Promise.resolve(stmt.all(...params));
    }
  };
  
  integrationAdapter = createIntegrationAdapter(wrappedDb);
  
  // Initialize tables
  await integrationAdapter.initTables();
  
  webhookService = new WebhookService({ adapter: integrationAdapter });
  
  return { db, integrationAdapter, webhookService };
}

function createWrappedDb(dbHandle) {
  return {
    run: (sql, params = []) => {
      const stmt = dbHandle.prepare(sql);
      const result = stmt.run(...params);
      return Promise.resolve({ lastID: result.lastInsertRowid, changes: result.changes });
    },
    get: (sql, params = []) => {
      const stmt = dbHandle.prepare(sql);
      return Promise.resolve(stmt.get(...params));
    },
    all: (sql, params = []) => {
      const stmt = dbHandle.prepare(sql);
      return Promise.resolve(stmt.all(...params));
    }
  };
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
    --info-blue: #60a5fa;
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
    display: flex;
    justify-content: space-between;
    align-items: center;
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
    grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
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
  .metric-card--info .metric-card__value { color: var(--info-blue); }

  /* Webhook cards */
  .webhook-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
    gap: 20px;
  }

  .webhook-card {
    background: var(--bg-panel);
    border: 1px solid var(--border-leather);
    border-radius: 8px;
    padding: 20px;
    transition: border-color 0.2s;
  }

  .webhook-card:hover {
    border-color: var(--gold-accent);
  }

  .webhook-card__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 12px;
  }

  .webhook-card__name {
    font-family: var(--font-serif);
    font-size: 18px;
    color: var(--text-cream);
    margin: 0;
  }

  .webhook-card__status {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
  }

  .webhook-card__status--enabled {
    background: rgba(74, 222, 128, 0.2);
    color: var(--success-green);
    border: 1px solid var(--success-green);
  }

  .webhook-card__status--disabled {
    background: rgba(248, 113, 113, 0.2);
    color: var(--danger-red);
    border: 1px solid var(--danger-red);
  }

  .webhook-card__url {
    font-family: var(--font-mono);
    font-size: 12px;
    color: var(--text-muted);
    word-break: break-all;
    margin-bottom: 12px;
  }

  .webhook-card__events {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-bottom: 16px;
  }

  .event-badge {
    display: inline-block;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 11px;
    background: rgba(96, 165, 250, 0.15);
    color: var(--info-blue);
    border: 1px solid rgba(96, 165, 250, 0.3);
  }

  .webhook-card__actions {
    display: flex;
    gap: 8px;
    padding-top: 12px;
    border-top: 1px solid var(--border-leather);
  }

  /* Buttons */
  .btn {
    display: inline-block;
    padding: 8px 16px;
    border: none;
    border-radius: 4px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
    text-decoration: none;
  }

  .btn--primary {
    background: var(--gold-accent);
    color: var(--bg-obsidian);
  }

  .btn--primary:hover {
    background: var(--gold-bright);
  }

  .btn--secondary {
    background: transparent;
    border: 1px solid var(--gold-accent);
    color: var(--gold-accent);
  }

  .btn--secondary:hover {
    background: rgba(212, 165, 116, 0.1);
  }

  .btn--danger {
    background: transparent;
    border: 1px solid var(--danger-red);
    color: var(--danger-red);
  }

  .btn--danger:hover {
    background: rgba(248, 113, 113, 0.2);
  }

  .btn--small {
    padding: 5px 10px;
    font-size: 11px;
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

  /* Delivery history table */
  .delivery-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 13px;
  }

  .delivery-table th {
    text-align: left;
    padding: 10px 12px;
    background: var(--bg-obsidian);
    color: var(--gold-accent);
    font-weight: 600;
    border-bottom: 2px solid var(--gold-accent);
  }

  .delivery-table td {
    padding: 10px 12px;
    border-bottom: 1px solid var(--border-leather);
  }

  .delivery-status {
    display: inline-block;
    padding: 2px 8px;
    border-radius: 3px;
    font-size: 11px;
    font-weight: 600;
  }

  .delivery-status--success {
    background: rgba(74, 222, 128, 0.2);
    color: var(--success-green);
  }

  .delivery-status--failed {
    background: rgba(248, 113, 113, 0.2);
    color: var(--danger-red);
  }

  .delivery-status--pending {
    background: rgba(251, 191, 36, 0.2);
    color: var(--warning-yellow);
  }
`;

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

function registerWebhookDashboardRoutes(router, { getWebhookService, includeRootRoute = true }) {
  // List webhooks
  router.get('/api/webhooks', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const userId = parseInt(req.query.userId) || 1; // Default user
      const webhooks = await service.listWebhooks(userId);
      res.json({ success: true, webhooks, count: webhooks.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get webhook by ID
  router.get('/api/webhooks/:id', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const webhook = await service.getWebhook(parseInt(req.params.id));
      if (!webhook) {
        return res.status(404).json({ success: false, error: 'Webhook not found' });
      }
      res.json({ success: true, webhook });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Create webhook
  router.post('/api/webhooks', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const userId = parseInt(req.body.userId) || 1;
      const { name, url, events } = req.body;

      if (!name || !url || !events || !Array.isArray(events)) {
        return res.status(400).json({
          success: false,
          error: 'name, url, and events[] are required'
        });
      }

      const webhook = await service.createWebhook(userId, { name, url, events });
      res.status(201).json({ success: true, webhook });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Update webhook
  router.put('/api/webhooks/:id', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const userId = parseInt(req.body.userId) || 1;
      const id = parseInt(req.params.id);
      const { name, url, events, enabled } = req.body;

      const updates = {};
      if (name !== undefined) updates.name = name;
      if (url !== undefined) updates.url = url;
      if (events !== undefined) updates.events = events;
      if (enabled !== undefined) updates.enabled = enabled;

      const webhook = await service.updateWebhook(id, userId, updates);
      res.json({ success: true, webhook });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Delete webhook
  router.delete('/api/webhooks/:id', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const userId = parseInt(req.query.userId) || 1;
      await service.deleteWebhook(parseInt(req.params.id), userId);
      res.json({ success: true, message: 'Webhook deleted' });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Get delivery history
  router.get('/api/webhooks/:id/deliveries', async (req, res) => {
    try {
      const service = getWebhookService();
      if (!service) {
        return res.status(503).json({ success: false, error: 'Webhook service not initialized' });
      }

      const deliveries = await service.getDeliveries(parseInt(req.params.id));
      res.json({ success: true, deliveries });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get available event types
  router.get('/api/event-types', (req, res) => {
    res.json({ success: true, eventTypes: EVENT_TYPES });
  });

  if (includeRootRoute) {
    // SSR Main Dashboard
    router.get('/', async (req, res) => {
      try {
        const service = getWebhookService();
        if (!service) {
          res.status(503).type('html').send('<h1>Webhook Dashboard</h1><p>Initializing…</p>');
          return;
        }

        const userId = parseInt(req.query.userId) || 1;
        const webhooks = await service.listWebhooks(userId);

        // Calculate metrics
        const enabledCount = webhooks.filter(w => w.enabled).length;
        const disabledCount = webhooks.length - enabledCount;

        const dashboard = new WebhookDashboard({
          webhooks,
          metrics: {
            total: webhooks.length,
            enabled: enabledCount,
            disabled: disabledCount,
            eventTypes: EVENT_TYPES.length
          },
          eventTypes: EVENT_TYPES
        });

        const html = renderPage(dashboard, 'Webhook Management');
        res.send(html);
      } catch (err) {
        console.error('[WebhookDashboard] Render error:', err);
        res.status(500).send(`<pre>Error: ${err.message}\n${err.stack}</pre>`);
      }
    });
  }
}

registerWebhookDashboardRoutes(app, {
  getWebhookService: () => webhookService
});

// ─────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────

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
</body>
</html>`;
}

async function createWebhookDashboardRouter(options = {}) {
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
    throw new Error('createWebhookDashboardRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const wrappedDb = createWrappedDb(resolved.dbHandle);
  const adapter = createIntegrationAdapter(wrappedDb);
  await adapter.initTables();
  const service = new WebhookService({ adapter });

  const router = express.Router();
  router.use(express.json());
  router.use(express.urlencoded({ extended: true }));
  registerWebhookDashboardRoutes(router, {
    getWebhookService: () => service,
    includeRootRoute
  });

  return { router, close: resolved.close };
}

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'WebhookDashboard';
  const args = parseArgs();
  const port = args.port;

  initDb(args.dbPath).then(() => {
    wrapServerForCheck(app, port, undefined, () => {
      console.log(`[WebhookDashboard] Server running at http://localhost:${port}`);
    });
  }).catch(err => {
    console.error('[WebhookDashboard] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, initDb, PORT, createWebhookDashboardRouter };

