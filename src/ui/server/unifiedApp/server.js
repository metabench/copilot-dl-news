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
const { createDocsViewerRouter } = require('../docsViewer/server');
const { createDesignStudioRouter } = require('../designStudio/server');
const { createPlaceHubGuessingRouter } = require('../placeHubGuessing/server');
const { createTopicHubGuessingRouter } = require('../topicHubGuessing/server');
const { createTopicListsRouter } = require('../topicLists/server');
const { createCrawlObserverRouter } = require('../crawlObserver/server');
const { createCrawlStatusRouter } = require('../crawlStatus/server');
const { TelemetryIntegration } = require('../../../crawler/telemetry/TelemetryIntegration');
const { InProcessCrawlJobRegistry } = require('../../../server/crawl-api/v1/core/InProcessCrawlJobRegistry');
const { registerCrawlApiV1Routes } = require('../../../api/route-loaders/crawl-v1');
const { createCrawlService } = require('../../../server/crawl-api/core/crawlService');

const PORT = process.env.PORT || 3000;

function parseEnvBoolean(value, fallback = false) {
  if (value === undefined || value === null) return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function parseNumber(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return n;
}

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

// Shared client modules (plain browser scripts) used by lightweight UIs.
app.use(
  '/shared-remote-obs',
  express.static(path.join(__dirname, '..', '..', 'client', 'remoteObservable', 'browser'))
);

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

  // Canonical crawler telemetry (SSE + remote-observable) + optional DB persistence.
  const crawlTelemetry = new TelemetryIntegration({
    historyLimit: 500,
    db: getDbRW()?.db,
    bridgeOptions: {
      defaultCrawlType: 'standard'
    }
  });

  crawlTelemetry.mountSSE(unifiedApp, '/api/crawl-telemetry/events');
  crawlTelemetry.mountRemoteObservable(unifiedApp, '/api/crawl-telemetry/remote-obs');
  unifiedApp.get('/api/crawl-telemetry/history', (req, res) => {
    const limitRaw = req.query && req.query.limit != null ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.trunc(limitRaw)) : undefined;
    const history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(limit) : [];
    res.json({
      status: 'ok',
      items: history
    });
  });

  const crawlServiceOptions = {
    telemetryIntegration: crawlTelemetry
  };

  const inProcessCrawlJobRegistry = new InProcessCrawlJobRegistry({
    createCrawlService,
    serviceOptions: crawlServiceOptions,
    telemetryIntegration: crawlTelemetry,
    allowMultiJobs: parseEnvBoolean(process.env.UI_ALLOW_MULTI_JOBS, false),
    historyLimit: parseNumber(process.env.UI_IN_PROCESS_JOB_HISTORY_LIMIT, 200)
  });

  registerCrawlApiV1Routes(unifiedApp, {
    basePath: '/api/v1/crawl',
    createCrawlService,
    serviceOptions: crawlServiceOptions,
    inProcessJobRegistry: inProcessCrawlJobRegistry
  });

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
    },
    {
      id: 'place-hubs',
      mountPath: '/place-hubs',
      full: () => createPlaceHubGuessingRouter({
        getDbRW
      })
    },
    {
      id: 'topic-hubs',
      mountPath: '/topic-hubs',
      full: () => createTopicHubGuessingRouter({
        getDbRW
      })
    },
    {
      id: 'topic-lists',
      mountPath: '/topic-lists',
      full: () => createTopicListsRouter({
        getDbRW
      })
    },
    {
      id: 'docs',
      mountPath: '/docs',
      full: () => createDocsViewerRouter({
        docsPath: path.join(process.cwd(), 'docs')
      })
    },
    {
      id: 'design',
      mountPath: '/design',
      full: () => createDesignStudioRouter({
        designPath: path.join(process.cwd(), 'design')
      })
    },
    {
      id: 'crawl-observer',
      mountPath: '/crawl-observer',
      full: () => createCrawlObserverRouter({
        getDbHandle: () => getDbRW()?.db
      })
    },
    {
      id: 'crawl-status',
      mountPath: '/crawl-status',
      full: () => createCrawlStatusRouter({
        jobsApiPath: '/api/v1/crawl/jobs',
        eventsPath: '/api/crawl-telemetry/events',
        telemetryHistoryPath: '/api/crawl-telemetry/history'
      })
    }
  ];

  const closers = [];
  closers.push(() => {
    try {
      crawlTelemetry.destroy();
    } catch {
      // ignore
    }
  });
  closers.push(() => {
    try {
      for (const job of inProcessCrawlJobRegistry.list()) {
        try {
          inProcessCrawlJobRegistry.stop(job.id);
        } catch {
          // ignore
        }
      }
    } catch {
      // ignore
    }
  });

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

// ─────────────────────────────────────────────────────────────
// Start Server
// ─────────────────────────────────────────────────────────────

if (require.main === module) {
  process.env.SERVER_NAME = process.env.SERVER_NAME || 'UnifiedApp';
  const args = parseArgs();
  const port = args.port;

  // Mount dashboard modules into the unified app (no-retirement: legacy servers keep working too)
  // NOTE: keep this inside the main entrypoint so importing this module in Jest stays cheap and
  // deterministic (no DB open, no background mounts).
  const mountedModules = mountDashboardModules(app, {
    dbPath: process.env.DB_PATH
  });

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
