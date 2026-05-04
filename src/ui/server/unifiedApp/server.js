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
const { createMcpLogger } = require("../../../shared/utils/mcpLogger");

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
const { createDomainRegistryRouter } = require('../domainRegistry/server');
const { createSchedulerDashboardRouter } = require('../schedulerDashboard/server');
const { createMultiModalCrawlRouter } = require('../multiModalCrawl/server');
const { createCrawlStrategiesRouter } = require('../crawlStrategies/server');
const { DomainRegistryStore } = require('../../../core/crawler/domains/DomainRegistryStore');
const { SearchService } = require('../../../search/SearchService');
const { TelemetryIntegration } = require('../../../core/crawler/telemetry/TelemetryIntegration');
const { InProcessCrawlJobRegistry } = require('../../../server/crawl-api/v1/core/InProcessCrawlJobRegistry');
const { registerCrawlApiV1Routes } = require('../../../api/route-loaders/crawl-v1');
const { createCrawlService } = require('../../../server/crawl-api/core/crawlService');
const { resolvePresetDateRange } = require('./lib/searchDateRange');
const { computeSearchFreshness } = require('./lib/searchFreshness');
const {
  appendRunComment,
  filterScreenshotRuns,
  getScreenshotRunFilters,
  getRunComments,
  listScreenshotRuns,
  resolveDomSnapshotAsset,
  resolveScreenshotAsset
} = require('./lib/screenshotReviewStore');
const {
  DEFAULT_CLOUD_CRAWL_TARGETS,
  getCloudCrawlStatusSnapshot,
  normalizeDomains
} = require('../../../data/db/sqlite/v1/queries/ui/cloudCrawl');

const PORT = process.env.PORT || 3000;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

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

function parseBooleanQuery(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return fallback;
}

function createCheckModeSubApps() {
  const homeContent = '<div class="home-dashboard"><div class="home-hero"><h1>Unified App (check mode)</h1></div></div>';
  const panelDemoContent = '<section data-unified-activate="panel-demo"><div class="panel-status">Panel demo check mode</div></section>';
  const cloudCrawlContent = '<section data-unified-activate="cloud-crawl" data-cloud-crawl-root="true" data-cloud-crawl-api-base="/api/cloud-crawl" data-cloud-crawl-command="npm run crawl -- remote bounded --domains bbc.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com --max-pages 5 --max-concurrent 5 --poll 3 --timeout-min 10"><div data-cloud-crawl-stat="remote">check</div><div data-cloud-crawl-stat="activeJobs">0</div><div data-cloud-crawl-stat="downloaded">0 / 25</div><div data-cloud-crawl-stat="errors">0</div><div data-cloud-crawl-targets="true"></div><div data-cloud-crawl-recent="true">No recent target downloads found.</div><div data-cloud-crawl-status="true">Check mode</div></section>';
  const searchExplorerContent = '<section data-unified-activate="search-explorer"><input type="text" data-search-input="q" value="" /></section>';
  const downloadVerificationContent = '<section data-unified-activate="download-verification" data-download-verification-root="true"><div data-download-verification-table="true">Download verification check mode</div></section>';
  const screenshotReviewContent = '<section data-unified-activate="screenshot-review" data-screenshot-review-root="true" data-screenshot-review-api-base="/api/screenshot-review"><div data-screenshot-review-stat="runs">-</div><div data-screenshot-review-stat="images">-</div><div data-screenshot-review-stat="comments">-</div><div data-screenshot-review-stat="latest">-</div><select data-screenshot-review-filter="session"><option value="all">All sessions</option></select><select data-screenshot-review-filter="app"><option value="all">All apps</option></select><button type="button" data-screenshot-review-action="refresh">Refresh</button><div data-screenshot-review-runs="true">Loading screenshot runs...</div><div data-screenshot-review-gallery="true">Select a run.</div><pre data-screenshot-review-comments="true">No run selected.</pre><form data-screenshot-review-comment-form="true"><select data-screenshot-review-comment-target="true"><option value="run">Whole run</option></select><textarea data-screenshot-review-comment-input="true"></textarea><button type="submit">Save Comment</button></form><div data-screenshot-review-status="true">Check mode</div></section>';

  return [
    {
      id: 'home',
      label: 'Home',
      icon: '🏠',
      category: 'System',
      description: 'Unified shell home (check mode)',
      renderContent: async () => ({
        content: homeContent,
        embed: 'panel',
        activationKey: 'home'
      })
    },
    {
      id: 'panel-demo',
      label: 'Panel Demo',
      icon: '🧪',
      category: 'Diagnostics',
      description: 'Panel activation seam check',
      renderContent: async () => ({
        content: panelDemoContent,
        embed: 'panel',
        activationKey: 'panel-demo'
      })
    },
    {
      id: 'cloud-crawl',
      label: 'Cloud Crawl',
      icon: '☁️',
      category: 'Crawler',
      description: 'Cloud crawl check payload',
      renderContent: async () => ({
        content: cloudCrawlContent,
        embed: 'panel',
        activationKey: 'cloud-crawl'
      })
    },
    {
      id: 'search-explorer',
      label: 'Search Explorer',
      icon: '🔎',
      category: 'Analytics',
      description: 'Search explorer check payload',
      renderContent: async () => ({
        content: searchExplorerContent,
        embed: 'panel',
        activationKey: 'search-explorer'
      })
    },
    {
      id: 'download-verification',
      label: 'Download Verify',
      icon: '✅',
      category: 'Analytics',
      description: 'Download verification check payload',
      renderContent: async () => ({
        content: downloadVerificationContent,
        embed: 'panel',
        activationKey: 'download-verification'
      })
    },
    {
      id: 'screenshot-review',
      label: 'Screenshots',
      icon: '🖼️',
      category: 'Diagnostics',
      description: 'Screenshot review check payload',
      renderContent: async () => ({
        content: screenshotReviewContent,
        embed: 'panel',
        activationKey: 'screenshot-review'
      })
    }
  ];
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

const SUB_APPS_FACTORY = parseEnvBoolean(process.env.UNIFIED_APP_CHECK_MODE, false)
  ? () => createCheckModeSubApps()
  : (opts) => createSubAppRegistry(opts);

// We delay executing the factory until mountDashboardModules is called, so we can pass getDbRW.

// ─────────────────────────────────────────────────────────────
// Express App
// ─────────────────────────────────────────────────────────────

const app = express();
app.use(express.json());
app.get('/favicon.ico', (req, res) => res.status(204).end());

// Shared client modules (plain browser scripts) used by lightweight UIs.
app.use(
  '/shared-remote-obs',
  express.static(path.join(__dirname, '..', '..', 'client', 'remoteObservable', 'browser'))
);

function normalizeRouterFactoryResult(result) {
  if (!result) {
    return { router: null, close: () => { } };
  }

  if (typeof result === 'function') {
    return { router: result, close: () => { } };
  }

  if (result.router) {
    return { router: result.router, close: typeof result.close === 'function' ? result.close : () => { } };
  }

  return { router: result, close: () => { } };
}

function initUnifiedDb(options = {}) {
  const { dbPath, getDbRW: injectedGetDbRW } = options;

  if (typeof injectedGetDbRW === 'function') {
    return { getDbRW: injectedGetDbRW, close: () => { } };
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

  unifiedApp.get('/api/screenshot-review/runs', (req, res) => {
    try {
      const limit = Math.max(1, Math.min(parseNumber(req.query.limit, 50), 100));
      const allRuns = listScreenshotRuns({ repoRoot: PROJECT_ROOT, limit: 250 });
      const runs = filterScreenshotRuns(allRuns, {
        session: req.query.session,
        app: req.query.app
      }).slice(0, limit);
      res.json({
        status: 'ok',
        filters: getScreenshotRunFilters(allRuns),
        appliedFilters: {
          session: req.query.session || 'all',
          app: req.query.app || 'all'
        },
        runs
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  unifiedApp.get('/api/screenshot-review/comments', (req, res) => {
    try {
      const result = getRunComments({ repoRoot: PROJECT_ROOT, runId: req.query.run });
      if (!result) return res.status(404).json({ status: 'error', message: 'Screenshot run not found' });
      res.json({ status: 'ok', ...result });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  unifiedApp.post('/api/screenshot-review/comments', (req, res) => {
    try {
      const result = appendRunComment({
        repoRoot: PROJECT_ROOT,
        runId: req.body && req.body.runId,
        target: req.body && req.body.target,
        comment: req.body && req.body.comment
      });
      if (!result) return res.status(404).json({ status: 'error', message: 'Screenshot run not found' });
      res.json({ status: 'ok', ...result });
    } catch (error) {
      res.status(400).json({ status: 'error', message: error.message });
    }
  });

  unifiedApp.get('/api/screenshot-review/assets/:runId/:fileName', (req, res) => {
    try {
      const assetPath = resolveScreenshotAsset({
        repoRoot: PROJECT_ROOT,
        runId: req.params.runId,
        fileName: req.params.fileName
      });
      if (!assetPath) return res.status(404).send('Screenshot asset not found');
      res.sendFile(assetPath);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

  unifiedApp.get('/api/screenshot-review/dom/:runId/:fileName', (req, res) => {
    try {
      const assetPath = resolveDomSnapshotAsset({
        repoRoot: PROJECT_ROOT,
        runId: req.params.runId,
        fileName: req.params.fileName
      });
      if (!assetPath) return res.status(404).send('DOM snapshot not found');
      res.type('text/plain').sendFile(assetPath);
    } catch (error) {
      res.status(500).send(error.message);
    }
  });

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
      throw new Error('Raw database handle is null. Wrapper type: ' + typeof dbWrapper + ', keys: ' + Object.keys(dbWrapper).slice(0, 5).join(','));
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

  unifiedApp.get('/api/downloads/recent', (req, res) => {
    try {
      const limit = normalizePositiveInt(req.query.limit, 10, 50);
      const rows = getDb().prepare(`
        SELECT
          r.id,
          u.url,
          u.host,
          r.http_status AS httpStatus,
          r.bytes_downloaded AS bytesDownloaded,
          r.fetched_at AS fetchedAt,
          r.content_type AS contentType
        FROM http_responses r
        JOIN urls u ON r.url_id = u.id
        ORDER BY r.fetched_at DESC
        LIMIT ?
      `).all(limit);

      res.json({ status: 'ok', limit, items: rows });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  unifiedApp.get('/api/downloads/verifications', (req, res) => {
    try {
      const limit = normalizePositiveInt(req.query.limit, 25, 100);
      const since = normalizeDateParam(req.query.since);
      const result = downloadEvidence.getRecentDownloadVerifications(getDb(), { limit, since });
      res.json({ status: 'ok', ...result });
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

  function normalizeDateParam(value) {
    if (typeof value !== 'string') return null;
    const v = value.trim();
    if (!v) return null;
    return v;
  }

  function normalizePositiveInt(value, fallback, max = null) {
    const n = Number.parseInt(value, 10);
    if (!Number.isFinite(n) || n <= 0) return fallback;
    if (Number.isFinite(max)) return Math.min(n, max);
    return n;
  }

  function normalizeDomainQuery(value) {
    if (Array.isArray(value)) return normalizeDomains(value);
    if (typeof value !== 'string' || !value.trim()) return [...DEFAULT_CLOUD_CRAWL_TARGETS];
    return normalizeDomains(value.split(','));
  }

  unifiedApp.get('/api/cloud-crawl/status', (req, res) => {
    try {
      const domains = normalizeDomainQuery(req.query.domains);
      const maxPagesPerDomain = normalizePositiveInt(req.query.maxPages, 5, 1000);
      const recentLimit = normalizePositiveInt(req.query.recentLimit, 12, 50);
      const since = normalizeDateParam(req.query.since);
      const snapshot = getCloudCrawlStatusSnapshot(getDb(), {
        domains,
        maxPagesPerDomain,
        recentLimit,
        since
      });

      const jobs = inProcessCrawlJobRegistry.list();
      const activeJobs = jobs.filter((job) => job && job.status === 'running').length;
      const history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(200) : [];
      const sinceMs = Date.now() - 10 * 60 * 1000;
      const errorsLast10m = Array.isArray(history)
        ? history.filter((event) => {
            const timestampMs = getHistoryTimestampMs(event);
            return isCrawlErrorEvent(event) && (timestampMs == null || timestampMs >= sinceMs);
          }).length
        : 0;

      res.json({
        status: 'ok',
        remote: {
          label: 'configured',
          command: `npm run crawl -- remote bounded --domains ${domains.join(',')} --max-pages ${maxPagesPerDomain} --max-concurrent ${domains.length} --poll 3 --timeout-min 10`
        },
        activeJobs,
        errorsLast10m,
        ...snapshot
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  function buildSearchQuery(baseQuery, authorFilter) {
    const query = typeof baseQuery === 'string' ? baseQuery.trim() : '';
    const author = typeof authorFilter === 'string' ? authorFilter.trim().replace(/"/g, '') : '';

    let next = query || '*';
    if (author) {
      next += ` author:"${author}"`;
    }
    return next;
  }

  function normalizeSectionFilter(value) {
    if (typeof value !== 'string') return null;
    const section = value.trim();
    return section ? section.toLowerCase() : null;
  }

  function sectionMatches(result, sectionFilter) {
    if (!sectionFilter) return true;
    const section = typeof result.section === 'string' ? result.section.trim().toLowerCase() : '';
    return section === sectionFilter;
  }

  function hostAllowed(result, enabledHostSet) {
    if (!(enabledHostSet instanceof Set)) return true;
    const host = typeof result.host === 'string' ? result.host.trim().toLowerCase() : '';
    if (!host) return false;
    return enabledHostSet.has(host);
  }

  unifiedApp.get('/api/search-explorer/options', (req, res) => {
    try {
      const dbWrapper = getDbRW();
      const registryStore = new DomainRegistryStore({ db: dbWrapper });
      const { items } = registryStore.list();
      const enabledOnly = parseBooleanQuery(req.query.enabledOnly, true);

      const sections = getDb()
        .prepare(`
          SELECT ca.section AS section, COUNT(*) AS count
          FROM content_analysis ca
          WHERE ca.section IS NOT NULL
            AND TRIM(ca.section) != ''
          GROUP BY ca.section
          ORDER BY count DESC
          LIMIT 50
        `)
        .all()
        .map((row) => ({
          section: row.section,
          count: Number(row.count) || 0
        }));

      const domains = items
        .filter((entry) => (enabledOnly ? Boolean(entry.enabled) : true))
        .map((entry) => ({
          host: entry.host,
          enabled: Boolean(entry.enabled),
          crawlProfile: entry.crawlProfile || null,
          preflightStatus: entry.preflight && entry.preflight.status ? entry.preflight.status : null
        }));

      res.json({
        status: 'ok',
        enabledOnly,
        domains,
        sections,
        defaults: {
          limit: 20,
          datePreset: '7d',
          enabledOnly: true
        },
        counts: {
          totalDomains: items.length,
          enabledDomains: items.filter((entry) => entry.enabled).length,
          optionDomains: domains.length
        }
      });
    } catch (error) {
      res.status(500).json({ status: 'error', message: error.message });
    }
  });

  unifiedApp.get('/api/search-explorer/search', (req, res) => {
    try {
      const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
      const author = typeof req.query.author === 'string' ? req.query.author.trim() : '';
      if (!query && !author) {
        return res.status(400).json({
          status: 'error',
          message: 'Provide q or author to search.'
        });
      }

      const domain = typeof req.query.domain === 'string' && req.query.domain.trim() ? req.query.domain.trim() : null;
      const sectionFilter = normalizeSectionFilter(req.query.section);
      const enabledOnly = parseBooleanQuery(req.query.enabledOnly, true);
      const page = normalizePositiveInt(req.query.page, 1);
      const limit = normalizePositiveInt(req.query.limit, 20, 100);
      const offset = (page - 1) * limit;

      const resolvedDates = resolvePresetDateRange(
        req.query.datePreset,
        normalizeDateParam(req.query.startDate),
        normalizeDateParam(req.query.endDate)
      );

      const searchQuery = buildSearchQuery(query, author);
      const searchService = new SearchService(getDb(), {
        defaultLimit: 20,
        maxLimit: 200
      });

      const dbWrapper = getDbRW();
      const registryStore = new DomainRegistryStore({ db: dbWrapper });
      const { items } = registryStore.list();
      const enabledHostSet = new Set(
        items
          .filter((entry) => entry.enabled)
          .map((entry) => String(entry.host || '').trim().toLowerCase())
          .filter(Boolean)
      );

      if (enabledOnly && domain && !enabledHostSet.has(String(domain).trim().toLowerCase())) {
        return res.status(400).json({
          status: 'error',
          message: `Selected domain is not enabled in Domain Registry: ${domain}`
        });
      }

      const includeFacets = req.query.includeFacets === '1' || req.query.includeFacets === 'true';

      const requiresPostFilter = Boolean(sectionFilter) || enabledOnly;

      if (!requiresPostFilter) {
        const result = searchService.search(searchQuery, {
          limit,
          offset,
          domain,
          startDate: resolvedDates.startDate,
          endDate: resolvedDates.endDate,
          includeHighlights: true,
          includeFacets
        });

        const freshness = computeSearchFreshness(result.results);

        return res.json({
          status: result.success ? 'ok' : 'error',
          query,
          appliedQuery: result.parsedQuery || searchQuery,
          author,
          enabledOnly,
          domain,
          section: null,
          datePreset: resolvedDates.datePreset,
          startDate: resolvedDates.startDate,
          endDate: resolvedDates.endDate,
          freshness,
          ...result
        });
      }

      const scanChunk = Math.min(100, Math.max(limit * 4, 40));
      const maxScanRounds = 8;
      let scanOffset = 0;
      let rounds = 0;
      let lastResponse = null;
      const matched = [];
      let hasMoreRaw = false;

      while (rounds < maxScanRounds) {
        rounds += 1;
        const response = searchService.search(searchQuery, {
          limit: scanChunk,
          offset: scanOffset,
          domain,
          startDate: resolvedDates.startDate,
          endDate: resolvedDates.endDate,
          includeHighlights: true,
          includeFacets: false
        });

        lastResponse = response;
        const rows = Array.isArray(response.results) ? response.results : [];
        for (const row of rows) {
          if (sectionMatches(row, sectionFilter) && hostAllowed(row, enabledOnly ? enabledHostSet : null)) {
            matched.push(row);
          }
        }

        hasMoreRaw = Boolean(response.pagination && response.pagination.hasMore);
        if (!hasMoreRaw) break;
        if (matched.length >= offset + limit) break;

        scanOffset += scanChunk;
      }

      const paged = matched.slice(offset, offset + limit);
      const hasMore = matched.length > offset + limit || hasMoreRaw;
      const freshness = computeSearchFreshness(paged);

      res.json({
        status: lastResponse && lastResponse.success ? 'ok' : 'error',
        success: Boolean(lastResponse && lastResponse.success),
        query,
        appliedQuery: (lastResponse && lastResponse.parsedQuery) || searchQuery,
        author,
        enabledOnly,
        domain,
        section: sectionFilter,
        datePreset: resolvedDates.datePreset,
        startDate: resolvedDates.startDate,
        endDate: resolvedDates.endDate,
        freshness,
        results: paged,
        pagination: {
          total: matched.length,
          limit,
          offset,
          hasMore,
          page,
          totalPages: matched.length === 0 ? 0 : Math.ceil(matched.length / limit)
        },
        facets: includeFacets && lastResponse ? lastResponse.facets : null,
        metrics: {
          durationMs: lastResponse && lastResponse.metrics ? lastResponse.metrics.durationMs : 0,
          resultsReturned: paged.length,
          scanRounds: rounds,
          scannedResults: matched.length
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
      id: 'domain-registry',
      mountPath: '/domain-registry',
      apiOnly: () => createDomainRegistryRouter({
        getDbRW,
        includeRootRoute: false,
        includeApiRoutes: true
      }),
      full: () => createDomainRegistryRouter({
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
    },
    {
      id: 'remote-crawl-admin',
      mountPath: '/remote-crawl',
      full: () => {
        const { createRemoteCrawlAdminRouter } = require('../remoteCrawlAdmin/server');
        let defaultRemoteHost = '141.144.193.218:3200';
        try {
          const { getFleetHostSync } = require('../../../../tools/crawl/lib/fleet-host-resolver');
          defaultRemoteHost = `${getFleetHostSync()}:3200`;
        } catch {
          // keep static fallback
        }
        return createRemoteCrawlAdminRouter({
          remoteHost: process.env.CRAWL_REMOTE_HOST || defaultRemoteHost
        });
      }
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
      let apiRouterResult;
      try {
        apiRouterResult = mod.apiOnly();
      } catch (err) {
        console.warn(`[UnifiedApp] Failed to create API router for ${mod.id}:`, err.message);
        apiRouterResult = null;
      }

      Promise.resolve(apiRouterResult)
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
      let fullRouterResult;
      try {
        fullRouterResult = mod.full();
      } catch (err) {
        console.warn(`[UnifiedApp] Failed to create router for ${mod.id} at ${mod.mountPath}:`, err.message);
        fullRouterResult = null;
      }

      Promise.resolve(fullRouterResult)
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

  // Serve the unified shell
  unifiedApp.get('/', async (req, res) => {
    try {
      const activeAppId = req.query.app || 'home';
      const SUB_APPS = SUB_APPS_FACTORY({ getDbRW });
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
  unifiedApp.get('/api/apps', (req, res) => {
    const SUB_APPS = SUB_APPS_FACTORY({ getDbRW });
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
  unifiedApp.get('/api/apps/:appId/content', async (req, res) => {
    const { appId } = req.params;
    const SUB_APPS = SUB_APPS_FACTORY({ getDbRW });
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
process.env.SERVER_NAME = process.env.SERVER_NAME || 'UnifiedApp';
const args = parseArgs();
const port = args.port;
const checkMode = parseEnvBoolean(process.env.UNIFIED_APP_CHECK_MODE, false);

log.info('Starting unified app shell', { port, checkMode });

// Mount dashboard modules into the unified app (no-retirement: legacy servers keep working too)
// NOTE: keep this inside the main entrypoint so importing this module in Jest stays cheap and
// deterministic (no DB open, no background mounts).
let mountedModules;
if (checkMode) {
  app.get('/', async (req, res) => {
    const activeAppId = req.query.app || 'home';
    const shell = new UnifiedShell({
      subApps: SUB_APPS_FACTORY({}),
      activeAppId
    });
    res.type('html').send(shell.render());
  });

  app.get('/api/apps', (req, res) => {
    const SUB_APPS = SUB_APPS_FACTORY({});
    res.json({
      apps: SUB_APPS.map((subApp) => ({
        id: subApp.id,
        label: subApp.label,
        icon: subApp.icon,
        category: subApp.category,
        description: subApp.description
      }))
    });
  });

  app.get('/api/apps/:appId/content', async (req, res) => {
    const SUB_APPS = SUB_APPS_FACTORY({});
    const subApp = SUB_APPS.find((entry) => entry.id === req.params.appId);
    if (!subApp) {
      return res.status(404).json({ error: 'App not found' });
    }

    const normalized = normalizeSubAppRenderResult(await subApp.renderContent(req));
    res.json({
      appId: subApp.id,
      content: normalized.content,
      activationKey: normalized.activationKey,
      embed: normalized.embed
    });
  });

  app.get('/docs', (req, res) => {
    res.status(200).type('html').send('<!doctype html><html><head><title>Docs (check)</title></head><body><div id="docs-check-root">Docs check mode</div></body></html>');
  });

  app.get('/design', (req, res) => {
    res.status(200).type('html').send('<!doctype html><html><head><title>Design (check)</title></head><body><div id="design-check-root">Design check mode</div></body></html>');
  });

  app.get('/docs/assets/docs-viewer.css', (req, res) => {
    res.status(200).type('text/css').send('/* check-mode docs css */');
  });

  app.get('/design/assets/design-studio.css', (req, res) => {
    res.status(200).type('text/css').send('/* check-mode design css */');
  });

  app.get('/api/crawl/summary', (req, res) => {
    res.json({
      status: 'ok',
      activeJobs: 0,
      jobsTotal: 0,
      lastEventAt: null,
      lastError: null,
      errorsLast10m: 0,
      lastFailingJobId: null,
      lastFailingUrl: null,
      checkMode: true
    });
  });

  app.get('/api/downloads/verifications', (req, res) => {
    res.json({
      status: 'ok',
      generatedAt: new Date().toISOString(),
      limit: 3,
      since: null,
      summary: {
        total: 1,
        downloaded: 1,
        savedToDb: 1,
        verified: 1,
        levelRecorded: 1,
        algorithms: [{ algorithm: 'brotli', count: 1 }]
      },
      items: [
        {
          httpResponseId: 1,
          urlId: 1,
          url: 'https://example.com/check-download',
          host: 'example.com',
          fetchedAt: '2026-04-29 00:00:00',
          downloaded: true,
          savedToDb: true,
          verified: true,
          http: { status: 200, bytesDownloaded: 1024, contentType: 'text/html', contentEncoding: null },
          storage: { contentStorageId: 1, storageType: 'db_compressed', sha256Prefix: 'abcdef123456', uncompressedSize: 1024, compressedSize: 320, compressionRatio: 0.3125 },
          compression: { typeName: 'brotli_6', algorithm: 'brotli', level: 6, levelRecorded: true, options: ['window_bits=22'], optionsRecorded: true, source: 'compression_types' }
        }
      ]
    });
  });

  app.get('/api/cloud-crawl/status', (req, res) => {
    const domains = ['bbc.com', 'theguardian.com', 'cbsnews.com', 'nbcnews.com', 'france24.com'];
    res.json({
      status: 'ok',
      remote: {
        label: 'check',
        command: 'npm run crawl -- remote bounded --domains bbc.com,theguardian.com,cbsnews.com,nbcnews.com,france24.com --max-pages 5 --max-concurrent 5 --poll 3 --timeout-min 10'
      },
      activeJobs: 0,
      errorsLast10m: 0,
      domains,
      goal: 5,
      since: null,
      totals: {
        targetSites: 5,
        goalDownloads: 25,
        okDownloads: 0,
        sitesAtGoal: 0,
        progressPct: 0
      },
      targets: domains.map((domain) => ({
        domain,
        goal: 5,
        okDownloads: 0,
        latestFetchedAt: null,
        progressPct: 0
      })),
      recentDownloads: []
    });
  });

  const screenshotCheckRun = {
    runId: 'check-run',
    title: 'check-mode/screenshots',
    sessionId: 'check-mode',
    appKeys: ['screenshot-review'],
    relativeOutputDir: 'screenshots/check-mode',
    ok: true,
    capturedAt: '2026-05-04T00:00:00.000Z',
    routeCount: 1,
    commentCount: 1,
    commentsPath: 'screenshots/check-mode/SCREENSHOT_COMMENTS.md',
    analysisPath: 'screenshots/check-mode/analysis.json',
    routes: [
      {
        key: 'screenshot-review',
        routeKey: 'screenshot-review',
        viewportKey: 'desktop',
        url: '/?app=screenshot-review',
        screenshotBytes: 67,
        screenshotSkipped: false,
        fileName: 'screenshot-review.png',
        imageUrl: '/api/screenshot-review/assets/check-run/screenshot-review.png',
        domSnapshotBytes: 1234,
        domSnapshotSkipped: false,
        domFileName: 'screenshot-review.html',
        domSnapshotUrl: '/api/screenshot-review/dom/check-run/screenshot-review.html',
        metrics: { horizontalOverflow: false }
      }
    ]
  };

  app.get('/api/screenshot-review/runs', (req, res) => {
    res.json({
      status: 'ok',
      filters: {
        sessions: [{ value: 'check-mode', label: 'check-mode' }],
        apps: [{ value: 'screenshot-review', label: 'screenshot-review' }]
      },
      appliedFilters: {
        session: req.query.session || 'all',
        app: req.query.app || 'all'
      },
      runs: [screenshotCheckRun]
    });
  });

  app.get('/api/screenshot-review/comments', (req, res) => {
    res.json({
      status: 'ok',
      runId: req.query.run || 'check-run',
      commentsPath: screenshotCheckRun.commentsPath,
      commentCount: 1,
      content: '# Screenshot Comments: check-mode/screenshots\n\n## 2026-05-04T00:00:00.000Z\n\n- Status: pending\n  Target: screenshot-review\n  Comment:\n  Check-mode comment.\n  Agent notes: pending\n'
    });
  });

  app.post('/api/screenshot-review/comments', (req, res) => {
    res.json({
      status: 'ok',
      runId: (req.body && req.body.runId) || 'check-run',
      commentsPath: screenshotCheckRun.commentsPath,
      commentCount: 2,
      content: '# Screenshot Comments: check-mode/screenshots\n\n- Status: pending\n  Target: run\n  Comment:\n  Check-mode saved comment.\n'
    });
  });

  app.get('/api/screenshot-review/assets/:runId/:fileName', (req, res) => {
    const onePixelPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=', 'base64');
    res.type('png').send(onePixelPng);
  });

  app.get('/api/screenshot-review/dom/:runId/:fileName', (req, res) => {
    res.type('text/plain').send('<!doctype html><html><body>Screenshot review check DOM</body></html>');
  });

  app.get('/api/search-explorer/search', (req, res) => {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const author = typeof req.query.author === 'string' ? req.query.author.trim() : '';
    if (!query && !author) {
      return res.status(400).json({
        status: 'error',
        message: 'Provide q or author to search.'
      });
    }

    return res.json({
      status: 'ok',
      success: true,
      query,
      author,
      appliedQuery: query || `author:"${author}"`,
      enabledOnly: true,
      domain: null,
      section: null,
      datePreset: '7d',
      startDate: null,
      endDate: null,
      freshness: {
        freshnessLabel: 'Fresh',
        confidenceBand: 'High',
        confidenceScore: 95,
        coveragePct: 100,
        totalResults: 1,
        datedResults: 1,
        newestAgeDays: 0,
        oldestAgeDays: 0,
        newestDate: '2026-02-19',
        oldestDate: '2026-02-19',
        staleResults: 0,
        summary: 'Fresh · High confidence (95%)'
      },
      results: [
        {
          id: 1,
          title: 'Search Explorer check-mode result',
          host: 'example.com',
          date: '2026-02-19',
          section: 'check',
          url: 'https://example.com/check-mode-result',
          rank: 1
        }
      ],
      pagination: {
        total: 1,
        limit: 20,
        offset: 0,
        hasMore: false,
        page: 1,
        totalPages: 1
      },
      facets: null,
      metrics: {
        durationMs: 1,
        resultsReturned: 1,
        scanRounds: 1,
        scannedResults: 1
      }
    });
  });

  mountedModules = {
    close: () => { }
  };
} else {
  mountedModules = mountDashboardModules(app, {
    dbPath: process.env.DB_PATH
  });
}

wrapServerForCheck(app, port, undefined, () => {
  log.info('Unified app shell ready', {
    url: `http://localhost:${port}`,
    subApps: SUB_APPS_FACTORY({}).length
  });
  console.log(`\n🎛️  Unified App Shell running at http://localhost:${port}\n`);
  console.log('Available sub-apps:');
  for (const app of SUB_APPS_FACTORY({})) {
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

module.exports = { app, SUB_APPS: SUB_APPS_FACTORY({}), mountDashboardModules };
