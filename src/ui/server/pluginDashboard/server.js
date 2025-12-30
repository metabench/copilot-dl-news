'use strict';

/**
 * Plugin Management Dashboard Server
 * 
 * Express server at port 3122 providing:
 * - GET / - Main dashboard showing all plugins
 * - GET /api/plugins - List all plugins
 * - GET /api/plugins/:id - Get plugin details
 * - POST /api/plugins/:id/activate - Activate plugin
 * - POST /api/plugins/:id/deactivate - Deactivate plugin
 * - POST /api/plugins/discover - Discover new plugins
 * 
 * Usage:
 *   node src/ui/server/pluginDashboard/server.js
 *   Open http://localhost:3122
 */

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');

const { PluginManager } = require('../../../plugins/PluginManager');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');

const { PluginDashboard } = require('./views/PluginDashboard');

const PORT = process.env.PORT || 3122;
const PLUGINS_DIR = process.env.PLUGINS_DIR || path.join(process.cwd(), 'plugins');

// ─────────────────────────────────────────────────────────────
// Plugin Manager Instance
// ─────────────────────────────────────────────────────────────

let pluginManager;

async function initPluginManager() {
  pluginManager = new PluginManager({
    pluginsDir: PLUGINS_DIR,
    services: {},
    config: null
  });
  
  // Discover plugins on startup
  await pluginManager.discoverPlugins();
  
  return pluginManager;
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
    --purple: #a78bfa;
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
    grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
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
  .metric-card--purple .metric-card__value { color: var(--purple); }

  /* Plugin table */
  .plugin-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 14px;
  }

  .plugin-table th {
    text-align: left;
    padding: 12px 16px;
    background: var(--bg-obsidian);
    color: var(--gold-accent);
    font-weight: 600;
    border-bottom: 2px solid var(--gold-accent);
    font-family: var(--font-serif);
  }

  .plugin-table td {
    padding: 14px 16px;
    border-bottom: 1px solid var(--border-leather);
  }

  .plugin-table tr:hover td {
    background: rgba(212, 165, 116, 0.08);
  }

  /* Plugin name and info */
  .plugin-name {
    font-weight: 600;
    color: var(--text-cream);
    margin-bottom: 2px;
  }

  .plugin-description {
    font-size: 12px;
    color: var(--text-muted);
  }

  /* Type badges */
  .type-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .type-badge--extractor {
    background: rgba(74, 222, 128, 0.15);
    color: var(--success-green);
    border: 1px solid rgba(74, 222, 128, 0.3);
  }

  .type-badge--analyzer {
    background: rgba(96, 165, 250, 0.15);
    color: var(--info-blue);
    border: 1px solid rgba(96, 165, 250, 0.3);
  }

  .type-badge--integration {
    background: rgba(167, 139, 250, 0.15);
    color: var(--purple);
    border: 1px solid rgba(167, 139, 250, 0.3);
  }

  .type-badge--ui-widget {
    background: rgba(251, 191, 36, 0.15);
    color: var(--warning-yellow);
    border: 1px solid rgba(251, 191, 36, 0.3);
  }

  /* State badges */
  .state-badge {
    display: inline-block;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
  }

  .state-badge--active {
    background: rgba(74, 222, 128, 0.2);
    color: var(--success-green);
    border: 1px solid var(--success-green);
  }

  .state-badge--loaded, .state-badge--initialized {
    background: rgba(96, 165, 250, 0.2);
    color: var(--info-blue);
    border: 1px solid var(--info-blue);
  }

  .state-badge--discovered, .state-badge--deactivated {
    background: rgba(184, 160, 144, 0.2);
    color: var(--text-muted);
    border: 1px solid var(--text-muted);
  }

  .state-badge--error {
    background: rgba(248, 113, 113, 0.2);
    color: var(--danger-red);
    border: 1px solid var(--danger-red);
  }

  /* Buttons */
  .btn {
    display: inline-block;
    padding: 6px 14px;
    border: none;
    border-radius: 4px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s;
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
    padding: 4px 10px;
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

  /* Version tag */
  .version-tag {
    font-family: var(--font-mono);
    font-size: 11px;
    color: var(--text-muted);
    background: rgba(0,0,0,0.3);
    padding: 2px 6px;
    border-radius: 3px;
  }
`;

// ─────────────────────────────────────────────────────────────
// Express app
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

function registerPluginDashboardRoutes(router, { getPluginManager, includeRootRoute = true }) {
  // List all plugins
  router.get('/api/plugins', (req, res) => {
    try {
      const manager = getPluginManager();
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Plugin manager not initialized' });
      }

      const plugins = [];
      for (const [id, plugin] of manager.plugins) {
        plugins.push({
          id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          type: plugin.manifest.type,
          description: plugin.manifest.description || '',
          state: plugin.state,
          error: plugin.error || null,
          dir: plugin.dir
        });
      }
      res.json({ success: true, plugins, count: plugins.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Get plugin by ID
  router.get('/api/plugins/:id', (req, res) => {
    try {
      const manager = getPluginManager();
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Plugin manager not initialized' });
      }

      const plugin = manager.plugins.get(req.params.id);
      if (!plugin) {
        return res.status(404).json({ success: false, error: 'Plugin not found' });
      }
      res.json({
        success: true,
        plugin: {
          id: req.params.id,
          name: plugin.manifest.name,
          version: plugin.manifest.version,
          type: plugin.manifest.type,
          description: plugin.manifest.description || '',
          state: plugin.state,
          error: plugin.error || null,
          manifest: plugin.manifest,
          dir: plugin.dir
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  // Activate (load + initialize + activate) a plugin
  router.post('/api/plugins/:id/activate', async (req, res) => {
    try {
      const manager = getPluginManager();
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Plugin manager not initialized' });
      }

      const id = req.params.id;
      await manager.loadPlugin(id);
      await manager.initializePlugin(id);
      await manager.activatePlugin(id);

      const plugin = manager.plugins.get(id);
      res.json({ success: true, state: plugin.state });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Deactivate a plugin
  router.post('/api/plugins/:id/deactivate', async (req, res) => {
    try {
      const manager = getPluginManager();
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Plugin manager not initialized' });
      }

      await manager.deactivatePlugin(req.params.id);
      const plugin = manager.plugins.get(req.params.id);
      res.json({ success: true, state: plugin.state });
    } catch (err) {
      res.status(400).json({ success: false, error: err.message });
    }
  });

  // Discover new plugins
  router.post('/api/plugins/discover', async (req, res) => {
    try {
      const manager = getPluginManager();
      if (!manager) {
        return res.status(503).json({ success: false, error: 'Plugin manager not initialized' });
      }

      const discovered = await manager.discoverPlugins();
      res.json({ success: true, discovered: discovered.length });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  });

  if (includeRootRoute) {
    // SSR Main Dashboard
    router.get('/', async (req, res) => {
      try {
        const manager = getPluginManager();
        if (!manager) {
          res.status(503).type('html').send('<h1>Plugin Dashboard</h1><p>Initializing…</p>');
          return;
        }

        const plugins = [];
        for (const [id, plugin] of manager.plugins) {
          plugins.push({
            id,
            name: plugin.manifest.name,
            version: plugin.manifest.version,
            type: plugin.manifest.type,
            description: plugin.manifest.description || '',
            state: plugin.state,
            error: plugin.error || null
          });
        }

        // Calculate metrics
        const activeCount = plugins.filter(p => p.state === 'active').length;
        const errorCount = plugins.filter(p => p.state === 'error').length;
        const typeBreakdown = {
          extractor: plugins.filter(p => p.type === 'extractor').length,
          analyzer: plugins.filter(p => p.type === 'analyzer').length,
          integration: plugins.filter(p => p.type === 'integration').length,
          'ui-widget': plugins.filter(p => p.type === 'ui-widget').length
        };

        const dashboard = new PluginDashboard({
          plugins,
          metrics: {
            total: plugins.length,
            active: activeCount,
            errors: errorCount,
            typeBreakdown
          }
        });

        const html = renderPage(dashboard, 'Plugin Manager');
        res.send(html);
      } catch (err) {
        console.error('[PluginDashboard] Render error:', err);
        res.status(500).send(`<pre>Error: ${err.message}\n${err.stack}</pre>`);
      }
    });
  }
}

registerPluginDashboardRoutes(app, {
  getPluginManager: () => pluginManager
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

async function createPluginDashboardRouter(options = {}) {
  const {
    pluginsDir = PLUGINS_DIR,
    pluginManager: injectedPluginManager,
    includeRootRoute = true
  } = options;

  let manager = injectedPluginManager;
  let close = () => {};

  if (!manager) {
    manager = new PluginManager({
      pluginsDir: pluginsDir,
      services: {},
      config: null
    });

    await manager.discoverPlugins();

    close = () => {
      // PluginManager does not currently expose a close/shutdown API.
      // When it does, call it here.
    };
  }

  const router = express.Router();
  router.use(express.json());
  registerPluginDashboardRoutes(router, {
    getPluginManager: () => manager,
    includeRootRoute
  });

  return { router, close };
}

// ─────────────────────────────────────────────────────────────
// Start server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  initPluginManager().then(() => {
    wrapServerForCheck(app, PORT, undefined, () => {
      console.log(`[PluginDashboard] Server running at http://localhost:${PORT}`);
      console.log(`[PluginDashboard] Scanning: ${PLUGINS_DIR}`);
      console.log(`[PluginDashboard] Discovered: ${pluginManager.plugins.size} plugins`);
    });
  }).catch(err => {
    console.error('[PluginDashboard] Failed to start:', err);
    process.exit(1);
  });
}

module.exports = { app, initPluginManager, PORT, createPluginDashboardRouter };
