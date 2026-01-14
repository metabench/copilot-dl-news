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
const { openNewsDb } = require('../../../data/db/dbAccess');
const { createMcpLogger } = require('../utils/serverStartupCheckmcpLogger');

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
const { createCrawlerProfilesRouter } = require('../crawlerProfiles/server');
const { createSchedulerDashboardRouter } = require('../schedulerDashboard/server');
const { createMultiModalCrawlRouter } = require('../multiModalCrawl/server');
const { createCrawlStrategiesRouter } = require('../crawlStrategies/server');
const { TelemetryIntegration } = require('../../../core/crawler/telemetry/TelemetryIntegration');
const { InProcessCrawlJobRegistry } = require('../../../server/crawl-api/v1/core/InProcessCrawlJobRegistry');
const { registerCrawlApiV1Routes } = require('../../../api/route-loaders/crawl-v1');
const { createCrawlService } = require('../../../server/crawl-api/core/crawlService');

const PORT = process.env.PORT || 3000;

// MCP Logger for AI agent visibility (vital-only to console, full logging to file/MCP)
const log = createMcpLogger.uiServer('unified-app');

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

function normalizeSubAppRenderResult(result) {
  if (typeof result === 'string') {
    return { content: result };
  }

  if (!result || typeof result !== 'object') {
    return { content: '' };
  }

  if (typeof result.content === 'string') {
    return {
      content: result.content,
      activationKey: typeof result.activationKey === 'string' ? result.activationKey : undefined,
      embed: typeof result.embed === 'string' ? result.embed : undefined
    };
  }

  if (typeof result.html === 'string') {
    return {
      content: result.html,
      activationKey: typeof result.activationKey === 'string' ? result.activationKey : undefined,
      embed: typeof result.embed === 'string' ? result.embed : undefined
    };
  }

  return { content: '' };
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

  // ═══════════════════════════════════════════════════════════════════════════
  // Download Evidence API - Proof-grade download statistics
  // ═══════════════════════════════════════════════════════════════════════════

  const downloadEvidence = require('../../../data/db/queries/downloadEvidence');

  // Helper to get the raw better-sqlite3 db object
  function getDb() {
    const dbWrapper = getDbRW();
    if (!dbWrapper) {
      throw new Error('Database wrapper is null');
    }
    const rawDb = dbWrapper.db;
    if (!rawDb) {
      throw new Error('Raw database handle is null. Wrapper type: ' + typeof dbWrapper + ', keys: ' + Object.keys(dbWrapper).slice(0,5).join(','));
    }
    if (!rawDb.open) {
      throw new Error('Database is not open. rawDb type: ' + typeof rawDb + ', has prepare: ' + (typeof rawDb.prepare === 'function'));
    }
    return rawDb;
  }

  // Debug endpoint to check database state
  unifiedApp.get('/api/downloads/debug', (req, res) => {
    try {
      const dbWrapper = getDbRW();
      const rawDb = dbWrapper?.db;
      res.json({
        status: 'ok',
        debug: {
          hasWrapper: !!dbWrapper,
          wrapperType: typeof dbWrapper,
          wrapperKeys: dbWrapper ? Object.keys(dbWrapper).slice(0, 10) : null,
          hasRawDb: !!rawDb,
          rawDbType: typeof rawDb,
          rawDbOpen: rawDb?.open,
          rawDbHasPrepare: typeof rawDb?.prepare === 'function'
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message, stack: error.stack });
    }
  });

  // Get global download stats (all-time)
  unifiedApp.get('/api/downloads/stats', (req, res) => {
    try {
      const stats = downloadEvidence.getGlobalStats(getDb());
      res.json({ status: 'ok', stats });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get download stats for a time range
  unifiedApp.get('/api/downloads/range', (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const stats = downloadEvidence.getDownloadStats(getDb(), start, end);
      res.json({ status: 'ok', start, end, stats });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get download timeline for progress visualization
  unifiedApp.get('/api/downloads/timeline', (req, res) => {
    try {
      const { start, end } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const timeline = downloadEvidence.getDownloadTimeline(getDb(), start, end);
      res.json({ status: 'ok', start, end, timeline });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get evidence bundle for downloads
  unifiedApp.get('/api/downloads/evidence', (req, res) => {
    try {
      const { start, end, limit = '100' } = req.query;
      if (!start || !end) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end (ISO timestamps)' 
        });
      }
      const evidence = downloadEvidence.getDownloadEvidence(
        getDb(), 
        start, 
        end, 
        parseInt(limit, 10)
      );
      res.json({ status: 'ok', start, end, count: evidence.length, evidence });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Verify a download claim (anti-hallucination endpoint)
  unifiedApp.get('/api/downloads/verify', (req, res) => {
    try {
      const { start, end, claimed } = req.query;
      if (!start || !end || claimed === undefined) {
        return res.status(400).json({ 
          status: 'error', 
          message: 'Missing required query params: start, end, claimed' 
        });
      }
      const result = downloadEvidence.verifyDownloadClaim(
        getDb(), 
        start, 
        end, 
        parseInt(claimed, 10)
      );
      res.json({ status: 'ok', ...result });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // Get active/recent crawl progress from task_events
  unifiedApp.get('/api/downloads/crawl-progress', (req, res) => {
    try {
      const db = getDb();
      
      // Find the most recent crawl task (started in the last 30 minutes)
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
      
      // Get the latest crawl task
      const latestTask = db.prepare(`
        SELECT DISTINCT task_id, task_type, MIN(ts) as started_at
        FROM task_events 
        WHERE event_type IN ('crawl:start', 'crawl:started')
          AND ts > ?
        GROUP BY task_id
        ORDER BY started_at DESC
        LIMIT 1
      `).get(thirtyMinAgo);
      
      if (!latestTask) {
        return res.json({ 
          status: 'ok', 
          active: false, 
          message: 'No active crawl in last 30 minutes'
        });
      }
      
      // Get the latest progress event for this task
      const latestProgress = db.prepare(`
        SELECT payload, ts
        FROM task_events 
        WHERE task_id = ? AND event_type = 'crawl:progress'
        ORDER BY seq DESC
        LIMIT 1
      `).get(latestTask.task_id);
      
      // Get the config from the start event
      const startEvent = db.prepare(`
        SELECT payload
        FROM task_events 
        WHERE task_id = ? AND event_type IN ('crawl:start', 'crawl:started')
        ORDER BY seq ASC
        LIMIT 1
      `).get(latestTask.task_id);
      
      let maxPages = 50; // default goal
      if (startEvent && startEvent.payload) {
        try {
          const config = JSON.parse(startEvent.payload);
          if (config.maxPages) maxPages = config.maxPages;
          if (config.config?.maxPages) maxPages = config.config.maxPages;
        } catch (e) { /* ignore parse errors */ }
      }
      
      let progress = { visited: 0, downloaded: 0, articles: 0, errors: 0 };
      if (latestProgress && latestProgress.payload) {
        try {
          progress = JSON.parse(latestProgress.payload);
        } catch (e) { /* ignore parse errors */ }
      }
      
      // Check if crawl is still active (last progress within 60 seconds)
      const lastProgressTime = latestProgress?.ts ? new Date(latestProgress.ts).getTime() : 0;
      const isActive = (Date.now() - lastProgressTime) < 60000;
      
      res.json({
        status: 'ok',
        active: isActive,
        taskId: latestTask.task_id,
        startedAt: latestTask.started_at,
        lastProgressAt: latestProgress?.ts || null,
        goal: maxPages,
        progress: {
          visited: progress.visited || 0,
          downloaded: progress.downloaded || 0,
          articles: progress.articles || 0,
          errors: progress.errors || 0,
          percentComplete: Math.min(100, Math.round(((progress.downloaded || 0) / maxPages) * 100))
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════

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

  function getHistoryTimestampMs(ev) {
    if (!ev || typeof ev !== 'object') return null;
    if (Number.isFinite(ev.timestampMs)) return ev.timestampMs;
    if (typeof ev.timestamp === 'string') {
      const parsed = Date.parse(ev.timestamp);
      return Number.isFinite(parsed) ? parsed : null;
    }
    return null;
  }

  function isCrawlErrorEvent(ev) {
    if (!ev || typeof ev !== 'object') return false;
    const type = typeof ev.type === 'string' ? ev.type : '';
    const severity = typeof ev.severity === 'string' ? ev.severity : '';

    return (
      severity === 'error' ||
      type.includes('error') ||
      type.includes('failed') ||
      type.includes('exception')
    );
  }

  function pickBestEffortUrl(ev) {
    if (!ev || typeof ev !== 'object') return null;
    const data = ev.data && typeof ev.data === 'object' ? ev.data : null;

    const candidates = [
      ev.url,
      data ? data.url : null,
      data ? data.startUrl : null,
      data ? data.pageUrl : null,
      data ? data.requestUrl : null,
      data ? data.href : null,
      data ? data.link : null
    ];

    for (const value of candidates) {
      if (typeof value === 'string' && value.trim()) return value.trim();
    }

    return null;
  }

  function pickLastCrawlErrorEvent(history) {
    if (!Array.isArray(history) || !history.length) return null;

    for (let i = history.length - 1; i >= 0; i -= 1) {
      const ev = history[i];
      if (!ev || typeof ev !== 'object') continue;

      const type = typeof ev.type === 'string' ? ev.type : '';
      const severity = typeof ev.severity === 'string' ? ev.severity : '';
      const message = typeof ev.message === 'string' ? ev.message : '';
      const data = ev.data && typeof ev.data === 'object' ? ev.data : null;

      if (!isCrawlErrorEvent(ev)) continue;

      const dataMessage = data && typeof data.error === 'string' ? data.error : null;

      return {
        type: type || null,
        severity: severity || null,
        timestamp: typeof ev.timestamp === 'string' ? ev.timestamp : null,
        timestampMs: Number.isFinite(ev.timestampMs) ? ev.timestampMs : null,
        jobId: typeof ev.jobId === 'string' ? ev.jobId : null,
        url: pickBestEffortUrl(ev),
        crawlType: typeof ev.crawlType === 'string' ? ev.crawlType : null,
        message: (message || dataMessage || '').trim() || null
      };
    }

    return null;
  }

  unifiedApp.get('/api/crawl/summary', (req, res) => {
    const jobs = inProcessCrawlJobRegistry.list();
    const activeJobs = jobs.filter((job) => job && job.status === 'running').length;

    const history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(200) : [];
    const lastError = pickLastCrawlErrorEvent(history);

    const nowMs = Date.now();
    const sinceMs = nowMs - 10 * 60 * 1000;
    let errorsLast10m = 0;
    if (Array.isArray(history) && history.length) {
      for (let i = history.length - 1; i >= 0; i -= 1) {
        const ev = history[i];
        const ts = getHistoryTimestampMs(ev);

        if (ts != null && ts < sinceMs) break;
        if (isCrawlErrorEvent(ev)) errorsLast10m += 1;
      }
    }

    const lastFailingJobId = lastError && typeof lastError.jobId === 'string' ? lastError.jobId : null;
    const lastFailingUrl = lastError && typeof lastError.url === 'string' ? lastError.url : null;

    const lastEvent = Array.isArray(history) && history.length ? history[history.length - 1] : null;
    const lastEventAt = lastEvent && typeof lastEvent.timestamp === 'string' ? lastEvent.timestamp : null;

    res.json({
      status: 'ok',
      activeJobs,
      jobsTotal: jobs.length,
      lastEventAt,
      lastError,
      errorsLast10m,
      lastFailingJobId,
      lastFailingUrl
    });
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
      id: 'crawler-profiles',
      mountPath: '/crawler-profiles',
      apiOnly: () => createCrawlerProfilesRouter({
        getDbRW,
        includeRootRoute: false,
        includeApiRoutes: true
      }),
      full: () => createCrawlerProfilesRouter({
        getDbRW,
        includeRootRoute: true,
        includeApiRoutes: false
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
    },
    {
      id: 'multi-modal-crawl',
      mountPath: '/multi-modal',
      full: () => createMultiModalCrawlRouter({ getDbRW })
    },
    {
      id: 'scheduler',
      mountPath: '/scheduler',
      apiOnly: () => createSchedulerDashboardRouter({ getDbRW, includeRootRoute: false }),
      full: () => createSchedulerDashboardRouter({ getDbRW })
    },
    {
      id: 'crawl-strategies',
      mountPath: '/crawl-strategies',
      full: () => createCrawlStrategiesRouter({ logger: log, getDbRW })
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
    log.error('Render error', { error: err.message, stack: err.stack });
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
    const renderResult = await app.renderContent(req);
    const normalized = normalizeSubAppRenderResult(renderResult);
    res.json({
      appId,
      content: normalized.content,
      activationKey: normalized.activationKey,
      embed: normalized.embed
    });
  } catch (err) {
    log.error(`Error rendering sub-app: ${appId}`, { appId, error: err.message });
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

  log.info('Starting unified app shell', { port });

  // Mount dashboard modules into the unified app (no-retirement: legacy servers keep working too)
  // NOTE: keep this inside the main entrypoint so importing this module in Jest stays cheap and
  // deterministic (no DB open, no background mounts).
  const mountedModules = mountDashboardModules(app, {
    dbPath: process.env.DB_PATH
  });

  wrapServerForCheck(app, port, undefined, () => {
    log.info('Unified app shell ready', { 
      url: `http://localhost:${port}`,
      subApps: SUB_APPS.length 
    });
    console.log(`\n🎛️  Unified App Shell running at http://localhost:${port}\n`);
    console.log('Available sub-apps:');
    for (const app of SUB_APPS) {
      console.log(`  ${app.icon} ${app.label}`);
    }
    console.log('\n');
  });

  const shutdown = () => {
    log.info('Shutting down unified app shell');
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

