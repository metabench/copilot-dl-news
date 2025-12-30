'use strict';

/**
 * Unified App Shell - Single Page Application Container
 * 
 * A unified dashboard shell that hosts multiple sub-apps with:
 * - Vertical navigation sidebar (using TwoColumnLayoutFactory)
 * - DOM preservation (off-screen, not destroyed) for instant switching
 * - State retention across app switches
 * - WLILO theme consistency
 * 
 * Port: 3000
 * 
 * Usage:
 *   node src/ui/server/unifiedApp/server.js
 *   Open http://localhost:3000
 */

const express = require('express');
const path = require('path');
const jsgui = require('jsgui3-html');

const { createTwoColumnLayoutControls } = require('../../controls/layouts/TwoColumnLayoutFactory');
const { UnifiedShell } = require('./views/UnifiedShell');
const { createSubAppRegistry } = require('./subApps/registry');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { openNewsDb } = require('../../../db/dbAccess');

const { createRateLimitDashboardRouter } = require('../rateLimitDashboard/server');
const { createWebhookDashboardRouter } = require('../webhookDashboard/server');
const { createPluginDashboardRouter } = require('../pluginDashboard/server');
const { createQueryTelemetryRouter } = require('../queryTelemetry/server');
const { createQualityDashboardRouter } = require('../qualityDashboard/server');
const { createAnalyticsHubRouter } = require('../analyticsHub/server');

const PORT = process.env.PORT || 3000;

function parseArgs(argv = process.argv.slice(2)) {
  const args = {
    port: Number(process.env.PORT) || Number(PORT) || 3000
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
  }

  return args;
}

// ─────────────────────────────────────────────────────────────
// Sub-App Registry
// ─────────────────────────────────────────────────────────────

const SUB_APPS = createSubAppRegistry();

// ─────────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());

function normalizeRouterFactoryResult(result) {
  if (!result) {
    return { router: null, close: () => {} };
  }

  if (typeof result === 'function') {
    return { router: result, close: () => {} };
  }

  if (result.router) {
    return { router: result.router, close: typeof result.close === 'function' ? result.close : () => {} };
  }

  return { router: result, close: () => {} };
}

function initUnifiedDb(options = {}) {
  const { dbPath, getDbRW: injectedGetDbRW } = options;

  if (typeof injectedGetDbRW === 'function') {
    return { getDbRW: injectedGetDbRW, close: () => {} };
  }

  const db = openNewsDb(dbPath);
  return {
    getDbRW: () => db,
    close: () => {
      try {
        db.close();
      } catch {
        // ignore
      }
    }
  };
}

function mountDashboardModules(unifiedApp, options = {}) {
  const db = initUnifiedDb(options);
  const { getDbRW } = db;

  const modules = [
    {
      id: 'rate-limit',
      mountPath: '/rate-limit',
      apiOnly: () => createRateLimitDashboardRouter({ getDbRW, includeRootRoute: false }),
      full: () => createRateLimitDashboardRouter({ getDbRW })
    },
    {
      id: 'webhooks',
      mountPath: '/webhooks',
      apiOnly: () => createWebhookDashboardRouter({ getDbRW, includeRootRoute: false }),
      full: () => createWebhookDashboardRouter({ getDbRW })
    },
    {
      id: 'plugins',
      mountPath: '/plugins',
      apiOnly: () => createPluginDashboardRouter({ includeRootRoute: false }),
      full: () => createPluginDashboardRouter({})
    },
    {
      id: 'query-telemetry',
      mountPath: '/telemetry',
      full: () => createQueryTelemetryRouter({
        getDbHandle: () => getDbRW()?.db
      })
    },
    {
      id: 'quality',
      mountPath: '/quality',
      full: () => createQualityDashboardRouter({
        getDbHandle: () => getDbRW()?.db
      })
    },
    {
      id: 'analytics',
      mountPath: '/analytics',
      full: () => createAnalyticsHubRouter({
        getDbHandle: () => getDbRW()?.db
      })
    }
  ];

  const closers = [];

  for (const mod of modules) {
    if (typeof mod.apiOnly === 'function') {
      Promise.resolve(mod.apiOnly())
        .then((result) => {
          const normalized = normalizeRouterFactoryResult(result);
          if (normalized.router) {
            unifiedApp.use('/', normalized.router);
            closers.push(normalized.close);
          }
        })
        .catch((err) => {
          console.warn(`[UnifiedApp] Failed to mount API router for ${mod.id}:`, err.message);
        });
    }

    if (typeof mod.full === 'function') {
      Promise.resolve(mod.full())
        .then((result) => {
          const normalized = normalizeRouterFactoryResult(result);
          if (normalized.router) {
            unifiedApp.use(mod.mountPath, normalized.router);
            closers.push(normalized.close);
          }
        })
        .catch((err) => {
          console.warn(`[UnifiedApp] Failed to mount router for ${mod.id} at ${mod.mountPath}:`, err.message);
        });
    }
  }

  return {
    close: () => {
      for (const fn of closers) {
        try {
          fn();
        } catch {
          // ignore
        }
      }

      try {
        db.close();
      } catch {
        // ignore
      }
    }
  };
}

// Serve the unified shell
app.get('/', async (req, res) => {
  try {
    const activeAppId = req.query.app || 'home';
    const shell = new UnifiedShell({
      subApps: SUB_APPS,
      activeAppId
    });
    const html = shell.render();
    res.type('html').send(html);
  } catch (err) {
    console.error('Render error:', err);
    res.status(500).send('Error rendering app shell');
  }
});

// API: Get sub-app registry
app.get('/api/apps', (req, res) => {
  res.json({
    apps: SUB_APPS.map(app => ({
      id: app.id,
      label: app.label,
      icon: app.icon,
      category: app.category,
      description: app.description
    }))
  });
});

// API: Get sub-app content (for client-side loading)
app.get('/api/apps/:appId/content', async (req, res) => {
  const { appId } = req.params;
  const app = SUB_APPS.find(a => a.id === appId);
  
  if (!app) {
    return res.status(404).json({ error: 'App not found' });
  }
  
  try {
    const content = await app.renderContent(req);
    res.json({ appId, content });
  } catch (err) {
    console.error(`Error rendering ${appId}:`, err);
    res.status(500).json({ error: err.message });
  }
});

// Mount dashboard modules into the unified app (no-retirement: legacy servers keep working too)
const mountedModules = mountDashboardModules(app, {
  dbPath: process.env.DB_PATH
});

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'UnifiedApp';
  const args = parseArgs();
  const port = args.port;
  wrapServerForCheck(app, port, undefined, () => {
    console.log(`\n🎛️  Unified App Shell running at http://localhost:${port}\n`);
    console.log('Available sub-apps:');
    for (const app of SUB_APPS) {
      console.log(`  ${app.icon} ${app.label}`);
    }
    console.log('\n');
  });

  const shutdown = () => {
    try {
      mountedModules.close();
    } catch {
      // ignore
    }
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

module.exports = { app, SUB_APPS, mountDashboardModules };
