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
const fs = require('fs');
const http = require('http');
const https = require('https');
const jsgui = require('jsgui3-html');

const { createTwoColumnLayoutControls } = require('../../controls/layouts/TwoColumnLayoutFactory');
const { UnifiedShell } = require('./views/UnifiedShell');
const { createSubAppRegistry } = require('./subApps/registry');
const { wrapServerForCheck } = require('../utils/serverStartupCheck');
const { openNewsDb } = require('../../../db/dbAccess');
const { createMcpLogger } = require("../../../shared/utils/mcpLogger");
const {
  listContentAnalysisSectionCounts,
  DEFAULT_CLOUD_CRAWL_TARGETS,
  getCloudCrawlStatusSnapshot,
  normalizeCloudCrawlDomains: normalizeDomains
} = require('news-crawler-db');

const { createRateLimitDashboardRouter } = require('../rateLimitDashboard/server');
const { createWebhookDashboardRouter } = require('../webhookDashboard/server');
const { createQueryTelemetryRouter } = require('../queryTelemetry/server');
const { createQualityDashboardRouter } = require('../qualityDashboard/server');
const { createAnalyticsHubRouter } = require('../analyticsHub/server');
const { createDocsViewerRouter } = require('../docsViewer/server');
const { createPlaceHubGuessingRouter } = require('../placeHubGuessing/server');
const { createPlaceHubsTableRouter } = require('../placeHubsTable/server');
const { createTopicHubGuessingRouter } = require('../topicHubGuessing/server');
const { createTopicListsRouter } = require('../topicLists/server');
// Six stale sub-apps retired (cycle 171 batch, mounts completed cycle 173 —
// the supervised boot was what exposed the relative-require dependencies the
// c171 static scan missed): pluginDashboard, designStudio, crawlerProfiles,
// domainRegistry, multiModalCrawl, crawlStrategies.
const { createCrawlObserverRouter } = require('../crawlObserver/server');
const { createSchedulerDashboardRouter } = require('../schedulerDashboard/server');
const { DomainRegistryStore } = require('../../../core/crawler/domains/DomainRegistryStore');
const { SearchService } = require('../../../search/SearchService');
const { TelemetryIntegration } = require('../../../core/crawler/telemetry/TelemetryIntegration');
const { InProcessCrawlJobRegistry } = require('../../../server/crawl-api/v1/core/InProcessCrawlJobRegistry');
const { RedownloadCooldownGuard } = require('news-crawler-itself/crawl-infra');
const { pickRotatedHosts } = require('news-crawler-itself/crawl-infra');
const { registerCrawlApiV1Routes } = require('../../../api/route-loaders/crawl-v1');
const { registerPlaceHubReviewRoutes } = require('../../../server/place-hub-review/registerPlaceHubReviewRoutes');
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
// (cloud-crawl queries now come from news-crawler-db directly — see the
// destructure above; the src/data/db/sqlite/v1/queries/ui/cloudCrawl shim
// this used to go through is retirement-bound.)

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
  const cloudCrawlContent = '<section data-unified-activate="cloud-crawl" data-cloud-crawl-root="true" data-cloud-crawl-api-base="/api/cloud-crawl" data-cloud-crawl-domains="bbc.com,theguardian.com,reuters.com,nytimes.com,washingtonpost.com,cnn.com,apnews.com,bloomberg.com,ft.com,npr.org" data-cloud-crawl-max-pages="1000" data-cloud-crawl-command="npm run crawl -- news-10x1000"><div data-cloud-crawl-stat="remote">check</div><div data-cloud-crawl-stat="activeJobs">0</div><div data-cloud-crawl-stat="downloaded">0 / 10000</div><div data-cloud-crawl-stat="errors">0</div><div data-cloud-crawl-health-card="true"><div data-cloud-crawl-health="remote"><div data-cloud-crawl-health-value="remote">checking…</div></div><div data-cloud-crawl-health="localWatermark"><div data-cloud-crawl-health-value="localWatermark">—</div></div><div data-cloud-crawl-health="lastSyncDurationMs"><div data-cloud-crawl-health-value="lastSyncDurationMs">—</div></div><div data-cloud-crawl-health="lastPrunedDeleted"><div data-cloud-crawl-health-value="lastPrunedDeleted">—</div></div><div data-cloud-crawl-health="remoteContentMb"><div data-cloud-crawl-health-value="remoteContentMb">—</div></div><div data-cloud-crawl-health="syncLagMs"><div data-cloud-crawl-health-value="syncLagMs">—</div></div><div data-cloud-crawl-health="ledgerSummary"><div data-cloud-crawl-health-value="ledgerSummary">—</div></div><div data-cloud-crawl-health="monitoredSmallCrawl"><div data-cloud-crawl-health-value="monitoredSmallCrawl">—</div></div></div><div data-cloud-crawl-targets="true"></div><div data-cloud-crawl-recent="true">No recent target downloads found.</div><div data-cloud-crawl-status="true">Check mode</div></section>';
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

  // Lean download broadcaster: turns batched crawl:progress snapshots into small,
  // specific `crawl:download` delta events (published only when new pages arrive),
  // so the mini dashboard gets an instant "+N" by subscribing to just that.
  let downloadTicker = null;
  try {
    const { CrawlDownloadTicker } = require('../../../core/crawler/telemetry/CrawlDownloadTicker');
    downloadTicker = new CrawlDownloadTicker(crawlTelemetry.bridge);
  } catch (err) {
    console.warn('[unifiedApp] download ticker unavailable:', err.message);
  }

  // Loopback-only test hook: publish a synthetic crawl:download so the pub/sub
  // path (backend publish -> SSE -> subscriber "+N") can be verified without a
  // live crawl. POST /api/crawl-telemetry/_emit-test?pages=N
  unifiedApp.post('/api/crawl-telemetry/_emit-test', (req, res) => {
    const ip = String(req.ip || (req.connection && req.connection.remoteAddress) || '');
    if (!/(^|:)(127\.0\.0\.1|::1)$/.test(ip) && !/127\.0\.0\.1|::1/.test(ip)) {
      return res.status(403).json({ error: 'loopback only' });
    }
    const n = Math.max(1, Math.min(500, Number(req.query.pages) || 5));
    try {
      const { createTelemetryEvent } = require('../../../core/crawler/telemetry/CrawlTelemetrySchema');
      crawlTelemetry.bridge.emitEvent(createTelemetryEvent(
        'crawl:download',
        { pages: n, docs: Math.round(n * 0.45), bytes: n * 90000, stored: n * 15000 },
        { jobId: 'test', source: 'emit-test' }
      ));
      res.json({ ok: true, emitted: { pages: n } });
    } catch (err) { res.status(500).json({ error: err.message }); }
  });
  unifiedApp.get('/api/crawl-telemetry/history', (req, res) => {
    const limitRaw = req.query && req.query.limit != null ? Number(req.query.limit) : undefined;
    const limit = Number.isFinite(limitRaw) ? Math.max(0, Math.trunc(limitRaw)) : undefined;
    let history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(limit) : [];
    // ?topic= and ?severity= were silently ignored (filed 2026-07-07 crawl-ops
    // c2 — error events were unfindable during a live failure). Filter here;
    // topic/severity match is exact, applied BEFORE the limit trim would lose
    // rarer events, so re-query without limit when filtering.
    const topic = req.query && typeof req.query.topic === 'string' ? req.query.topic : null;
    const severity = req.query && typeof req.query.severity === 'string' ? req.query.severity : null;
    if (topic || severity) {
      const all = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(undefined) : history;
      history = all.filter((e) => (!topic || e.topic === topic) && (!severity || e.severity === severity));
      if (limit) history = history.slice(-limit);
    }
    res.json({
      status: 'ok',
      items: history
    });
  });

  // ── Downloads-by-country chart (added 2026-07-11) ────────────────────────
  // The per-country aggregation is heavy on a large DB, so it runs in a CHILD
  // process (tools/crawl/country-download-stats.js) and is cached in memory;
  // the page serves the latest snapshot and kicks a refresh when stale.
  const countryStats = { data: null, generatedAt: 0, refreshing: false };
  function refreshCountryStats() {
    if (countryStats.refreshing) return;
    countryStats.refreshing = true;
    try {
      const { spawn } = require('child_process');
      const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
      const child = spawn(process.execPath, [path.join(repoRoot, 'tools', 'crawl', 'country-download-stats.js'), '--limit', '40'], { cwd: repoRoot, windowsHide: true });
      let out = '';
      child.stdout.on('data', (c) => { out += c.toString(); });
      child.stdout.on('error', () => { /* async stdout read error (EPIPE etc.): degrade, never crash the server child */ });
      child.on('exit', () => {
        try {
          countryStats.data = JSON.parse(out);
          countryStats.generatedAt = Date.now();
        } catch (_) { /* keep previous snapshot */ }
        countryStats.refreshing = false;
      });
      child.on('error', () => { countryStats.refreshing = false; });
      setTimeout(() => { try { child.kill(); } catch (_) {} }, 360000);
    } catch (_) { countryStats.refreshing = false; }
  }

  unifiedApp.get('/api/analytics/country-downloads', (req, res) => {
    if (!countryStats.data || Date.now() - countryStats.generatedAt > 15 * 60 * 1000) refreshCountryStats();
    res.json({
      status: 'ok',
      generatedAt: countryStats.generatedAt ? new Date(countryStats.generatedAt).toISOString() : null,
      refreshing: countryStats.refreshing,
      countries: (countryStats.data && countryStats.data.byCountryHub) || []
    });
  });

  // Per-host crawl health (FAST / POLITE-THROTTLE / SLOW-IRREGULAR) for the
  // crawl-status UI badge — so the operator can SEE whether a slow host is a
  // compliant robots crawl-delay (polite) or a real stall (the distinction that
  // took months to pin, task #44). Computed in a CHILD PROCESS
  // (tools/crawl/host-health.js --json) so its ~2s GROUP BY over http_responses
  // never blocks this event loop (#39/#40); cached, serve-stale + refresh-when-stale.
  const hostHealth = { data: null, generatedAt: 0, refreshing: false };
  function refreshHostHealth() {
    if (hostHealth.refreshing) return;
    hostHealth.refreshing = true;
    try {
      const { spawn } = require('child_process');
      const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
      const child = spawn(process.execPath, [path.join(repoRoot, 'tools', 'crawl', 'host-health.js'), '--json', '--since-min', '60'], { cwd: repoRoot, windowsHide: true });
      let out = '';
      child.stdout.on('data', (c) => { out += c.toString(); });
      child.stdout.on('error', () => { /* EPIPE etc.: degrade, never crash the server child */ });
      child.on('exit', () => {
        try { hostHealth.data = JSON.parse(out); hostHealth.generatedAt = Date.now(); } catch (_) { /* keep previous snapshot */ }
        hostHealth.refreshing = false;
      });
      child.on('error', () => { hostHealth.refreshing = false; });
      setTimeout(() => { try { child.kill(); } catch (_) {} }, 60000);
    } catch (_) { hostHealth.refreshing = false; }
  }
  unifiedApp.get('/api/v1/crawl/host-health', (req, res) => {
    if (!hostHealth.data || Date.now() - hostHealth.generatedAt > 45 * 1000) refreshHostHealth();
    res.json({
      status: 'ok',
      generatedAt: hostHealth.generatedAt ? new Date(hostHealth.generatedAt).toISOString() : null,
      refreshing: hostHealth.refreshing,
      hosts: (hostHealth.data && hostHealth.data.hosts) || []
    });
  });

  unifiedApp.get('/country-downloads', (_req, res) => {
    res.type('html').send(`<!doctype html><html><head><meta charset="utf-8"><title>Downloads by Country</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#16130f;color:#e8e0d0;max-width:860px;margin:2rem auto;padding:0 1rem}h1{font-size:1.4rem}.row{display:flex;align-items:center;gap:10px;margin:6px 0}.label{width:160px;text-align:right;font-size:.9rem;text-transform:capitalize}.track{flex:1;background:#241f18;border-radius:4px;height:22px}.bar{height:22px;border-radius:4px;background:#4a90d9;transition:width .6s}.num{width:80px;font-variant-numeric:tabular-nums;font-size:.9rem}.sub{color:#998f7f;font-size:.85rem}</style></head>
<body><h1>📊 Downloads by Country</h1><p class="sub" id="meta">Loading…</p><div id="chart"></div>
<script>
async function load(){
  const r = await fetch('/api/analytics/country-downloads');
  const j = await r.json();
  const rows = j.countries || [];
  document.getElementById('meta').textContent = j.generatedAt
    ? ('Successful downloads under each country hub prefix — snapshot ' + j.generatedAt + (j.refreshing ? ' (refreshing…)' : ''))
    : 'Computing first snapshot (heavy query — up to a few minutes)…';
  if (!rows.length) return;
  const max = Math.max(...rows.map(x => x.downloads));
  document.getElementById('chart').innerHTML = rows.map(c =>
    '<div class="row"><div class="label">' + c.country + '</div><div class="track"><div class="bar" style="width:' +
    Math.max(1, Math.round(c.downloads / max * 100)) + '%"></div></div><div class="num">' +
    c.downloads.toLocaleString() + '</div></div>').join('');
}
load(); setInterval(load, 60000);
</script></body></html>`);
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // Download Evidence API - Proof-grade download statistics
  // ═══════════════════════════════════════════════════════════════════════════

  // Download-evidence queries direct from news-crawler-db (this used to go
  // through the src/data/db/queries/downloadEvidence re-export shim; the
  // getGlobalStats alias below preserves the shim's historical rename).
  const downloadEvidence = (() => {
    const {
      getDownloadStats,
      getDownloadEvidence,
      verifyDownloadClaim,
      getDownloadTimeline,
      getGlobalDownloadStats,
      getRecentDownloadVerifications,
      listRecentDownloads
    } = require('news-crawler-db');
    return {
      getDownloadStats,
      getDownloadEvidence,
      verifyDownloadClaim,
      getDownloadTimeline,
      getGlobalStats: getGlobalDownloadStats,
      getRecentDownloadVerifications,
      listRecentDownloads
    };
  })();

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
      const rows = downloadEvidence.listRecentDownloads(getDb(), { limit }).map((row) => ({
        id: row.id,
        url: row.url,
        host: row.host,
        httpStatus: row.http_status,
        bytesDownloaded: row.bytes_downloaded,
        fetchedAt: row.fetched_at,
        contentType: row.content_type
      }));

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

  // Get active/recent crawl progress from the DB task event access surface.
  unifiedApp.get('/api/downloads/crawl-progress', (req, res) => {
    try {
      const db = getDb();

      // Find the most recent crawl task (started in the last 30 minutes)
      const thirtyMinAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();

      const latestTask = db.taskEvents.getLatestStartedCrawlTaskSince(thirtyMinAgo);

      if (!latestTask) {
        return res.json({
          status: 'ok',
          active: false,
          message: 'No active crawl in last 30 minutes'
        });
      }

      const latestProgress = db.taskEvents.getLatestTaskEventPayload(latestTask.task_id, 'crawl:progress');

      // Get the config from the start event
      const startEvent = db.taskEvents.getFirstTaskEventPayload(latestTask.task_id, ['crawl:start', 'crawl:started']);

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

  function normalizeCloudHost(value) {
    return String(value || '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/.*$/, '');
  }

  function resolveRemoteCrawlHost() {
    if (process.env.CRAWL_REMOTE_HOST) return process.env.CRAWL_REMOTE_HOST;
    if (process.env.FLEET_HOST) return `${process.env.FLEET_HOST}:3200`;
    return '141.144.193.218:3200';
  }

  function fetchRemoteCrawlStatus(host, timeoutMs = 1800) {
    const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
    const url = new URL('/api/health', base);
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve, reject) => {
      const req = transport.request(url, { method: 'GET', timeout: timeoutMs }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try {
            resolve(JSON.parse(text));
          } catch (error) {
            reject(new Error(`Remote status returned non-JSON HTTP ${response.statusCode}`));
          }
        });
      });
      req.on('timeout', () => req.destroy(new Error(`Remote status timed out after ${timeoutMs}ms`)));
      req.on('error', reject);
      req.end();
    });
  }

  function fetchRemoteContentStats(host, timeoutMs = 2000) {
    const base = /^https?:\/\//i.test(host) ? host : `http://${host}`;
    const url = new URL('/api/content/stats', base);
    const transport = url.protocol === 'https:' ? https : http;
    return new Promise((resolve) => {
      const req = transport.request(url, { method: 'GET', timeout: timeoutMs }, (response) => {
        const chunks = [];
        response.on('data', (chunk) => chunks.push(chunk));
        response.on('end', () => {
          try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
          catch (_) { resolve(null); }
        });
      });
      req.on('timeout', () => { req.destroy(); resolve(null); });
      req.on('error', () => resolve(null));
      req.end();
    });
  }

  function readSyncLedgerSafe() {
    try {
      const { loadLedger, findUnconfirmed, findUnpruned, getLastWatermark } = require('../../../../tools/crawl/lib/sync-ledger');
      const ledgerFile = path.resolve(__dirname, '../../../../tools/crawl/.crawl-remote-ledger.json');
      const ledger = loadLedger(ledgerFile);
      return {
        lastWatermark: getLastWatermark(ledger),
        totalPulled: ledger.totalPulled || 0,
        unconfirmed: findUnconfirmed(ledger).length,
        unpruned: findUnpruned(ledger).length,
        entries: ledger.entries.length,
        lastEntry: ledger.entries[ledger.entries.length - 1] || null,
      };
    } catch (_) {
      return null;
    }
  }

  function buildHealthCardSnapshot({ remoteStatus, remoteError, remoteContentStats, ledgerSnapshot }) {
    const remoteHealth = remoteStatus
      ? (remoteError ? 'degraded' : 'healthy')
      : 'unavailable';
    const totals = remoteContentStats?.totals || {};
    const remoteContentBytes = Number(totals.compressed_size || totals.compressedSize || 0);
    const remoteContentRows = Number(totals.row_count || totals.rowCount || 0);
    const lastEntry = ledgerSnapshot?.lastEntry || null;
    const lastConfirmedAt = lastEntry?.confirmedAt || null;
    const lastPrunedAt = lastEntry?.prunedAt || null;
    const lastPrunedDeleted = lastEntry?.deleted || null;
    let lastSyncDurationMs = null;
    if (lastEntry?.exportedAt && lastEntry?.confirmedAt) {
      lastSyncDurationMs = Math.max(0, new Date(lastEntry.confirmedAt).getTime() - new Date(lastEntry.exportedAt).getTime());
    }
    let syncLagMs = null;
    if (lastEntry?.confirmedAt) {
      syncLagMs = Math.max(0, Date.now() - new Date(lastEntry.confirmedAt).getTime());
    }
    return {
      remote: remoteHealth,
      remoteError: remoteError || null,
      localWatermark: ledgerSnapshot?.lastWatermark || null,
      lastConfirmedAt,
      lastPrunedAt,
      lastPrunedDeleted,
      lastSyncDurationMs,
      syncLagMs,
      remoteContentRows,
      remoteContentBytes,
      remoteContentMb: remoteContentBytes ? Number((remoteContentBytes / (1024 * 1024)).toFixed(2)) : 0,
      ledger: ledgerSnapshot ? {
        entries: ledgerSnapshot.entries,
        unconfirmed: ledgerSnapshot.unconfirmed,
        unpruned: ledgerSnapshot.unpruned,
        totalPulled: ledgerSnapshot.totalPulled,
      } : null,
    };
  }

  function buildRemoteTargetSnapshot(domains, goal, remoteStatus) {
    const remoteDomains = Array.isArray(remoteStatus?.domains) ? remoteStatus.domains : [];
    const byDomain = new Map(remoteDomains.map((entry) => [normalizeCloudHost(entry.domain), entry]));
    return domains.map((domain) => {
      const record = byDomain.get(normalizeCloudHost(domain));
      const okDownloads = Number(record?.contentPipeline?.totalStored || record?.stats?.done || 0);
      return {
        domain,
        goal,
        okDownloads,
        latestFetchedAt: record?.stats?.latestFetchedAt || record?.lastActivityAt || null,
        progressPct: Math.min(100, Math.round((okDownloads / Math.max(goal, 1)) * 100)),
        remoteState: record?.state || 'unknown',
        remoteRunning: Boolean(record?.isRunning)
      };
    });
  }

  function buildMonitoredSmallCrawlOverviewSafe({ domains, since, recentLimit }) {
    try {
      const { collectRecentCrawlOverview } = require('../../../../tools/crawl/lib/monitored-small-crawl');
      return collectRecentCrawlOverview({
        hosts: domains,
        since,
        sampleLimit: recentLimit,
        command: 'dashboard recent-crawl overview',
      });
    } catch (error) {
      return {
        schemaVersion: 1,
        mode: 'monitored-small-crawl-report',
        generatedAt: new Date().toISOString(),
        readinessLabel: 'verification-blocked',
        blockers: ['recent-crawl-overview-unavailable'],
        warnings: [error.message],
        actionPolicy: {
          readOnlyReport: true,
          startsCrawler: false,
          contactsRemote: false,
          writesLocalDb: false,
          changesCollectBehavior: false,
        },
      };
    }
  }

  function buildMonitoredSmallCrawlStatusSummary(report) {
    const recent = report && report.recent ? report.recent : {};
    const delta = report && report.database ? report.database.delta : null;
    const samples = Array.isArray(recent.samples) ? recent.samples : [];
    const queryTimings = report && report.evidence && Array.isArray(report.evidence.queryTimings)
      ? report.evidence.queryTimings
      : [];
    const slowQueryWarningMs = Number(report?.evidence?.slowQueryWarningMs || 5000);
    const queryTimingMaxMs = queryTimings.reduce((max, row) => Math.max(max, Number(row.ms || 0) || 0), 0);
    const slowQueryStepCount = queryTimings.filter(row => (Number(row.ms || 0) || 0) > slowQueryWarningMs).length;
    const dataCompletenessLabel = delta
      && Number(delta.urls || 0) > 0
      && Number(delta.responses || 0) === 0
      && Number(delta.content || 0) === 0
      ? 'partial-url-only'
      : Number(recent.success || 0) > 0
        ? 'recent-downloads'
        : 'no-recent-downloads';
    const cadenceStatus = dataCompletenessLabel === 'partial-url-only'
      ? 'partial-data'
      : report?.readinessLabel === 'verification-blocked'
        ? 'blocked'
        : Number(recent.success || 0) > 0
          ? 'recent-data-visible'
          : 'no-recent-data';
    const latestSampleAt = samples.map(row => row.fetchedAt).filter(Boolean).sort().pop() || null;
    return {
      readinessLabel: report?.readinessLabel || 'unknown',
      dataCompletenessLabel,
      cadenceStatus,
      downloads: Number(recent.downloads || 0),
      success: Number(recent.success || 0),
      failed: Number(recent.failed || 0),
      sampleCount: samples.length,
      latestSampleAt,
      latestDownloadAt: latestSampleAt,
      queryTimingMaxMs,
      slowQueryStepCount,
      blockerCount: Array.isArray(report?.blockers) ? report.blockers.length : 0,
      warningCount: Array.isArray(report?.warnings) ? report.warnings.length : 0,
    };
  }

  unifiedApp.get('/api/cloud-crawl/status', async (req, res) => {
    try {
      const domains = normalizeDomainQuery(req.query.domains);
      const maxPagesPerDomain = normalizePositiveInt(req.query.maxPages, 1000, 1000);
      const recentLimit = normalizePositiveInt(req.query.recentLimit, 12, 50);
      const since = normalizeDateParam(req.query.since);
      const snapshot = getCloudCrawlStatusSnapshot(getDb(), {
        domains,
        maxPagesPerDomain,
        recentLimit,
        since
      });

      const remoteHost = resolveRemoteCrawlHost();
      let remoteStatus = null;
      let remoteError = null;
      try {
        remoteStatus = await fetchRemoteCrawlStatus(remoteHost);
      } catch (error) {
        remoteError = error.message;
      }

      const remoteContentStats = remoteStatus ? await fetchRemoteContentStats(remoteHost) : null;
      const ledgerSnapshot = readSyncLedgerSafe();

      const remoteTargets = remoteStatus && Array.isArray(remoteStatus.domains)
        ? buildRemoteTargetSnapshot(domains, maxPagesPerDomain, remoteStatus)
        : null;
      const remoteStored = Number(remoteStatus?.stored);
      const responseSnapshot = remoteTargets
        ? {
            ...snapshot,
            totals: {
              ...snapshot.totals,
              okDownloads: remoteTargets.reduce((sum, target) => sum + target.okDownloads, 0),
              sitesAtGoal: remoteTargets.filter((target) => target.okDownloads >= target.goal).length,
              progressPct: Math.min(100, Math.round((remoteTargets.reduce((sum, target) => sum + target.okDownloads, 0) / Math.max(domains.length * maxPagesPerDomain, 1)) * 100))
            },
            targets: remoteTargets
          }
        : (Number.isFinite(remoteStored)
            ? {
                ...snapshot,
                totals: {
                  ...snapshot.totals,
                  okDownloads: remoteStored,
                  progressPct: Math.min(100, Math.round((remoteStored / Math.max(domains.length * maxPagesPerDomain, 1)) * 100))
                }
              }
            : snapshot);

      const jobs = inProcessCrawlJobRegistry.list();
      const inProcessActiveJobs = jobs.filter((job) => job && job.status === 'running').length;
      const remoteActiveJobs = remoteStatus && Array.isArray(remoteStatus.domains)
        ? remoteStatus.domains.filter((domain) => domain && (domain.isRunning || domain.state === 'running')).length
        : Number(remoteStatus?.running || 0);
      const history = crawlTelemetry?.bridge?.getHistory ? crawlTelemetry.bridge.getHistory(200) : [];
      const monitoredSmallCrawl = buildMonitoredSmallCrawlOverviewSafe({
        domains,
        since,
        recentLimit,
      });
      const monitoredSmallCrawlSummary = buildMonitoredSmallCrawlStatusSummary(monitoredSmallCrawl);
      const monitoredRecentSamples = monitoredSmallCrawl
        && monitoredSmallCrawl.recent
        && Array.isArray(monitoredSmallCrawl.recent.samples)
        ? monitoredSmallCrawl.recent.samples.map((item) => ({
            host: item.host,
            url: item.url,
            httpStatus: item.httpStatus,
            bytesDownloaded: item.bytesDownloaded,
            fetchedAt: item.fetchedAt,
            contentType: item.contentType,
          }))
        : [];
      const responseWithMonitoredRecent = {
        ...responseSnapshot,
        recentDownloads: Array.isArray(responseSnapshot.recentDownloads) && responseSnapshot.recentDownloads.length
          ? responseSnapshot.recentDownloads
          : monitoredRecentSamples,
      };
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
          label: remoteStatus ? `remote ${remoteHost}` : 'configured',
          host: remoteHost,
          available: Boolean(remoteStatus),
          error: remoteError,
          command: 'npm run crawl -- news-10x1000',
        health: buildHealthCardSnapshot({ remoteStatus, remoteError, remoteContentStats, ledgerSnapshot }),
          orchestrator: remoteStatus?.orchestrator || null,
          totals: remoteStatus?.totals || { stored: remoteStatus?.stored, domains: remoteStatus?.domains }
        },
        activeJobs: remoteStatus ? remoteActiveJobs : inProcessActiveJobs,
        errorsLast10m,
        monitoredSmallCrawl,
        monitoredSmallCrawlSummary,
        ...responseWithMonitoredRecent
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

      const sections = listContentAnalysisSectionCounts(getDb(), { limit: 50 });

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

  // AI-operable review surface: uncertain classifier decisions out,
  // classification overrides + heuristic updates in. Never fatal to the
  // UI server — the crawler must run even if the review surface can't.
  try {
    registerPlaceHubReviewRoutes(unifiedApp, { basePath: '/api/v1/place-hubs' });
  } catch (err) {
    console.warn('[unifiedApp] place-hub review API unavailable:', err.message);
  }

  // Gazetteer place list for article→place matching. ArticlePlaceMatcher
  // fetches `${baseUrl}/api/gazetteer/places` (bare array of
  // {id, canonicalName, names:[{name, normalized}]}); until 2026-07-19 this
  // route existed nowhere, so in-app matching always saw zero candidates.
  // ~17MB / ~4s on the live gazetteer — the matcher caches for 5 minutes,
  // so serve fresh per request via the ncdb export (no raw SQL here).
  unifiedApp.get('/api/gazetteer/places', (req, res) => {
    try {
      const { listPlacesWithNamesForMatching } = require('news-crawler-db');
      const facadeForPlaces = getDbRW();
      const handleForPlaces = facadeForPlaces && facadeForPlaces.db ? facadeForPlaces.db : facadeForPlaces;
      res.json(listPlacesWithNamesForMatching(handleForPlaces));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── Global crawl bandwidth cap ─────────────────────────────────────────────
  // One process-wide token bucket (GlobalBandwidthLimiter) caps the AGGREGATE
  // download rate of every in-process crawl job. The cap is settable at runtime
  // (takes effect immediately, even mid-crawl, since jobs share the bucket) and
  // persists across restarts in data/crawl-settings.json. Default: 4 MB/s.
  const CRAWL_SETTINGS_PATH = path.join(__dirname, '..', '..', '..', '..', 'data', 'crawl-settings.json');
  const DEFAULT_BANDWIDTH_CAP_MBPS = 4;
  function readCrawlSettings() {
    try { return JSON.parse(fs.readFileSync(CRAWL_SETTINGS_PATH, 'utf8')) || {}; } catch (_) { return {}; }
  }
  function writeCrawlSettings(patch) {
    const next = Object.assign(readCrawlSettings(), patch);
    try { fs.writeFileSync(CRAWL_SETTINGS_PATH, JSON.stringify(next, null, 2)); } catch (_) { /* best-effort */ }
    return next;
  }
  function applyBandwidthCap(mbps) {
    const { getGlobalBandwidthLimiter } = require('news-crawler-itself/fetch-pipeline');
    const limiter = getGlobalBandwidthLimiter();
    const n = Number(mbps);
    limiter.setRateBytesPerSec(Number.isFinite(n) && n > 0 ? n * 1048576 : 0);
    return limiter.getSnapshot();
  }
  // Apply the persisted (or default) cap at startup.
  const bootCapMBps = (() => {
    const saved = readCrawlSettings().bandwidthCapMBps;
    return Number.isFinite(Number(saved)) ? Number(saved) : DEFAULT_BANDWIDTH_CAP_MBPS;
  })();
  applyBandwidthCap(bootCapMBps);

  unifiedApp.get('/api/v1/crawl/bandwidth-cap', (req, res) => {
    try {
      const { getGlobalBandwidthLimiter } = require('news-crawler-itself/fetch-pipeline');
      res.json(getGlobalBandwidthLimiter().getSnapshot());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
  unifiedApp.post('/api/v1/crawl/bandwidth-cap', (req, res) => {
    try {
      const mbps = Number(req.body && req.body.mbps);
      if (!Number.isFinite(mbps) || mbps < 0) {
        return res.status(400).json({ error: 'mbps must be a number >= 0 (0 = unlimited)' });
      }
      writeCrawlSettings({ bandwidthCapMBps: mbps });
      res.json(applyBandwidthCap(mbps));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── DB crawl frontier (P1+P2 of DB-driven crawling) ────────────────────────
  // "Candidate URLs not yet downloaded" = urls with no 200/304 http_responses,
  // minus policy-disallowed (allow=0). "Hubs due for refresh" = hub URLs whose
  // last successful fetch is older than the configured recency window (default
  // 1 day, UI-configurable — the owner's explicit ask). See
  // docs/plans/2026-07-db-driven-crawling.md. The count is a ~5-10s full urls
  // scan (synchronous better-sqlite3), so it runs in a CHILD process and is
  // cached — never computed in-request. Refreshed on an interval so the tile
  // is warm; the frontier moves slowly (1.5M).
  const DEFAULT_HUB_RECENCY_DAYS = 1;
  function currentHubRecencyDays() {
    const saved = readCrawlSettings().hubRefreshRecencyDays;
    const n = Number(saved);
    return Number.isFinite(n) && n > 0 ? n : DEFAULT_HUB_RECENCY_DAYS;
  }
  const frontierStats = { data: null, generatedAt: 0, refreshing: false };
  function refreshFrontierStats() {
    if (frontierStats.refreshing) return;
    frontierStats.refreshing = true;
    try {
      const { spawn } = require('child_process');
      const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
      const recencyMs = Math.round(currentHubRecencyDays() * 24 * 60 * 60 * 1000);
      const child = spawn(process.execPath, [
        path.join(repoRoot, 'tools', 'crawl', 'frontier-stats.js'),
        '--limit', '15', '--recency-ms', String(recencyMs)
      ], { cwd: repoRoot, windowsHide: true });
      let out = '';
      child.stdout.on('data', (c) => { out += c.toString(); });
      child.stdout.on('error', () => { /* async stdout read error (EPIPE etc.): degrade, never crash the server child */ });
      child.on('exit', () => {
        try { frontierStats.data = JSON.parse(out); frontierStats.generatedAt = Date.now(); } catch (_) { /* keep prior */ }
        frontierStats.refreshing = false;
      });
      child.on('error', () => { frontierStats.refreshing = false; });
      setTimeout(() => { try { child.kill(); } catch (_) {} }, 120000);
    } catch (_) { frontierStats.refreshing = false; }
  }
  // Warm the first snapshot shortly after boot, then refresh every 3 minutes.
  setTimeout(refreshFrontierStats, 8000);
  const _frontierTimer = setInterval(refreshFrontierStats, 3 * 60 * 1000);
  if (typeof _frontierTimer.unref === 'function') _frontierTimer.unref();

  unifiedApp.get('/api/v1/crawl/frontier/summary', (req, res) => {
    if (!frontierStats.data || Date.now() - frontierStats.generatedAt > 3 * 60 * 1000) refreshFrontierStats();
    const d = frontierStats.data;
    res.json({
      status: 'ok',
      generatedAt: frontierStats.generatedAt ? new Date(frontierStats.generatedAt).toISOString() : null,
      refreshing: frontierStats.refreshing,
      total: d ? d.total : null,
      crawlable: d ? d.crawlable : null,
      disallowed: d ? d.disallowed : null,
      hosts: d ? d.hosts : [],
      hubRecencyDays: currentHubRecencyDays(),
      hubTotal: d ? d.hubTotal : null,
      hubDisallowed: d ? d.hubDisallowed : null,
      hubNeverDownloaded: d ? d.hubNeverDownloaded : null,
      hubStale: d ? d.hubStale : null,
      // Dead-hub suppression (2026-07-20): hubs whose latest N attempts all
      // failed — excluded from due selection, surfaced here so the tile can
      // show what's being skipped rather than skipping silently.
      hubDead: d && d.hubDead !== undefined ? d.hubDead : null,
      hubLowValue: d && d.hubLowValue !== undefined ? d.hubLowValue : null,
      deadHubAfter: d && d.deadHubAfter !== undefined ? d.deadHubAfter : null
    });
  });

  // Hub refresh recency: how old a hub's last successful fetch must be before
  // it is considered "due" in the frontier. Persisted (bandwidth-cap pattern),
  // default 1 day. Changing it invalidates the cached frontier snapshot so the
  // next summary reflects the new window rather than a stale one.
  unifiedApp.get('/api/v1/crawl/hub-recency', (req, res) => {
    res.json({ days: currentHubRecencyDays() });
  });
  unifiedApp.post('/api/v1/crawl/hub-recency', (req, res) => {
    try {
      const days = Number(req.body && req.body.days);
      if (!Number.isFinite(days) || days <= 0) {
        return res.status(400).json({ error: 'days must be a number > 0' });
      }
      writeCrawlSettings({ hubRefreshRecencyDays: days });
      frontierStats.data = null; // force recompute against the new window
      refreshFrontierStats();
      res.json({ days });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── P3: frontier → crawl_queue hydration (dry-run; no fetching) ────────────
  // Composes two ncdb exports: selectDueFrontier picks due URLs for ONE host,
  // SqliteUrlQueueAdapter.enqueueBatch persists them into crawl_queue with a
  // lease/claim model the P4 per-host jobs will consume. Priorities: hubs above
  // articles so freshness-critical pages are claimed first. All SQL lives in
  // ncdb; this block is orchestration only. Verification below reports counts
  // from getStats() — an independent read — never the enqueue return alone
  // (the counters-lie discipline).
  let _frontierQueueAdapter = null;
  async function getFrontierQueueAdapter() {
    if (!_frontierQueueAdapter) {
      const { SqliteUrlQueueAdapter } = require('news-crawler-db');
      const facade = getDbRW();
      const handle = facade && facade.db ? facade.db : facade;
      // Guard: with no handle the adapter would silently OPEN ITS OWN
      // data/news.db relative to CWD (a shadow DB) — fail loudly instead.
      if (!handle) throw new Error('news.db handle unavailable — cannot bind crawl_queue adapter');
      // Assign only after successful initialize(): a throw here must not cache
      // a poisoned adapter that 500s every request until an app restart.
      const adapter = new SqliteUrlQueueAdapter({ db: handle });
      await adapter.initialize();
      _frontierQueueAdapter = adapter;
    }
    return _frontierQueueAdapter;
  }

  unifiedApp.get('/api/v1/crawl/frontier/queue-stats', async (req, res) => {
    try {
      const adapter = await getFrontierQueueAdapter();
      res.json(await adapter.getStats());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Shared hydrate semantics (P3, extracted for P6's auto-hydrate tick).
  // Recency semantics vs the queue's UNIQUE(url): a hub that was completed
  // in a previous cycle and is due again must be RE-enqueueable (that is the
  // whole point of hub recency), so completed/failed hub rows are reset to
  // pending. Articles are fetch-once — a completed article row blocking
  // re-enqueue is desired. Skips are split so the counters can't lie about
  // which case happened.
  async function enqueueDueItems(adapter, items, source) {
    const HUB_PRIORITY = 50, ARTICLE_PRIORITY = 10;
    let requeuedHubs = 0;
    for (const i of items) {
      if (i.kind === 'article-new') continue;
      const existing = await adapter.get(i.url);
      if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
        await adapter.returnToPending(i.url);
        requeuedHubs += 1;
      }
    }
    const result = await adapter.enqueueBatch(items.map((i) => ({
      url: i.url,
      domain: i.host,
      priority: i.kind === 'article-new' ? ARTICLE_PRIORITY : HUB_PRIORITY,
      // url_id persisted so P4's reconciliation never has to re-derive it by
      // a second urls-table lookup (avoiding the url-vs-url_id drift trap —
      // crawl_queue keys on url TEXT, http_responses keys on url_id).
      meta: { kind: i.kind, lastFetchedAt: i.lastFetchedAt, source, urlId: i.url_id }
    })));
    return {
      due: items.length,
      inserted: result.inserted,
      requeuedHubs,
      alreadyQueued: Math.max(0, result.skipped - requeuedHubs)
    };
  }

  unifiedApp.post('/api/v1/crawl/frontier/hydrate', async (req, res) => {
    try {
      const host = req.body && req.body.host ? String(req.body.host).trim() : null;
      if (!host) return res.status(400).json({ error: 'host is required (e.g. "www.bbc.com")' });
      const limit = Math.max(1, Math.min(500, Number(req.body.limit) || 50));
      // FIX 10/11: let a caller tune the hub-refresh vs article-new balance per
      // request (ncdb selectDueFrontier accepts hubFraction, default 0.5). Clamp
      // 0..1; omit when unset so the ncdb default applies.
      const hubFraction = (req.body && req.body.hubFraction != null && Number.isFinite(Number(req.body.hubFraction)))
        ? Math.max(0, Math.min(1, Number(req.body.hubFraction))) : undefined;
      const { selectDueFrontier } = require('news-crawler-db');
      // Inject the (pure, static) URL-shape predicate so the article-new branch
      // PREFERS article-shaped URLs over the unclassified section pages that
      // otherwise dominate the frontier (task #48 — the headline-freshness lever).
      const { ArticleSignalsService } = require('news-crawler-itself/signals');
      const facade = getDbRW();
      const handle = facade && facade.db ? facade.db : facade;
      const recencyMs = Math.round(currentHubRecencyDays() * 24 * 60 * 60 * 1000);
      // Fleet partition guard (plan v2 Phase D1): hosts the REMOTE node owns must
      // never enter the LOCAL due-list — exclusive ownership keeps the cross-node
      // sum of requests to a host at one node's paced output. Empty partition
      // (the default) excludes nothing.
      const { getFleetPartition } = require('../../../../tools/crawl/lib/fleet-host-resolver');
      const remoteOwned = getFleetPartition().remoteHosts;
      const due = selectDueFrontier(handle, {
        recencyMsHub: recencyMs, limit, host,
        preferArticleShaped: ArticleSignalsService.isArticleShapedUrl,
        ...(hubFraction !== undefined ? { hubFraction } : {}),
        ...(remoteOwned.length ? { excludeHosts: remoteOwned } : {})
      });
      const adapter = await getFrontierQueueAdapter();
      const outcome = await enqueueDueItems(adapter, due.items, 'frontier-hydrate');
      const stats = await adapter.getStats();
      res.json({ host, ...outcome, stats });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // No sweep of abandoned crawl_queue leases existed anywhere before P4 (an
  // orchestrator crash mid-run would leave rows 'in-progress' forever). 20-min
  // timeout comfortably exceeds a bandwidth-capped, host-throttled ~20-URL run.
  const FRONTIER_LEASE_TIMEOUT_MS = 20 * 60 * 1000;
  // P6: terminal rows (completed/failed) older than this are pruned on the
  // same maintenance tick — the P3 review flagged that getStats is a
  // full-table scan and nothing ever removed terminal rows, so the table
  // would grow without bound once hydration/runs are automated.
  const FRONTIER_TERMINAL_PRUNE_MS = 7 * 24 * 60 * 60 * 1000;
  const _frontierRecoverTimer = setInterval(async () => {
    try {
      const adapter = await getFrontierQueueAdapter();
      await adapter.recoverStale(FRONTIER_LEASE_TIMEOUT_MS);
      if (typeof adapter.pruneTerminal === 'function') {
        await adapter.pruneTerminal(FRONTIER_TERMINAL_PRUNE_MS);
      }
    } catch (_) { /* best-effort; retried next tick */ }
  }, 5 * 60 * 1000);
  if (typeof _frontierRecoverTimer.unref === 'function') _frontierRecoverTimer.unref();

  // ── P4: DB-seeded per-host crawl (first real fetching from crawl_queue) ────
  // Dequeues up to `limit` (hard-capped [1,20] for this first-live phase)
  // pending rows for one host from crawl_queue, fetches them through the
  // EXISTING operation->NewsCrawler->forked-worker path via
  // NewsCrawler.prototype.seedUrls() (see CrawlOperation.js — NOT
  // overrides.cachedSeedUrls, which would silently replay stale cached HTML
  // for exactly the due/stale URLs this exists to refresh), then reconciles
  // crawl_queue against real http_responses outcomes. Dequeue/markComplete/
  // markFailed/returnToPending happen ONLY here in the orchestrator — the
  // forked worker receives a plain startUrl + seedUrls string array over IPC
  // and never touches crawl_queue (the P3 review's single-connection
  // claim-safety constraint).
  //
  // Extracted to a standalone function (P5, 2026-07-20) so the place-hub
  // redownload route can drive the SAME dequeue->job->reconcile machinery
  // per host, rather than duplicating this ~130-line reconciliation
  // algorithm — the class of code where copy-paste drift causes real bugs.
  // On a job-start failure this throws an Error with .statusCode/.payload
  // set to the exact shape the original inline route used to return
  // directly, so callers can do res.status(err.statusCode).json(err.payload)
  // and the P4 route's HTTP contract is unchanged.
  // runFrontierJobForHost is split into startHostJob (dequeue + prep + FORK the
  // crawl job) and reconcileHostJob (wait + verify http_responses + mark the
  // queue). The split lets run-multi start every host's job CONCURRENTLY
  // (parallel fetching happens in forked workers, off the event loop) while
  // running the SYNCHRONOUS better-sqlite3 reconciliation SERIALLY with a yield
  // between hosts — the fix for the 2026-07-20 event-loop WEDGE, where 8-way
  // concurrent reconciliation on one WAL handle (each write blocking up to
  // busy_timeout under worker write-lock contention) starved the HTTP accept
  // loop. Single-host callers (/run, place-hubs redownload) use the thin
  // runFrontierJobForHost wrapper, whose behavior is unchanged.
  async function startHostJob({ host, limit, adapter, handle }) {
    // Dequeue loop: each adapter.dequeue() call is its own atomic
    // SELECT+UPDATE transaction (SqliteUrlQueueAdapter), so leases are safe
    // per-call regardless of interleaving; stop early once the host's pending
    // set is exhausted.
    const leased = [];
    for (let i = 0; i < limit; i++) {
      const row = await adapter.dequeue({ domain: host });
      if (!row) break;
      leased.push(row);
    }
    if (!leased.length) {
      return { earlyResult: { host, dequeued: 0, message: 'nothing pending for host — call /api/v1/crawl/frontier/hydrate first' } };
    }

    // Resolve a definitive url_id for every leased row ONCE: prefer
    // meta.urlId (persisted by hydrate since the P4 fix), fall back to a
    // url->url_id lookup for any row that predates it (a real gap found in
    // the first live run 2026-07-20 — rows hydrated before the fix have no
    // meta.urlId and would otherwise be unreconcilable and wrongly marked
    // failed despite genuinely succeeding).
    const { selectHttpOutcomesForUrlIds, selectUrlIdsForUrls } = require('news-crawler-db');
    const missingUrlIdRows = leased.filter((r) => !(r.meta && r.meta.urlId != null));
    const fallbackIds = missingUrlIdRows.length
      ? selectUrlIdsForUrls(handle, missingUrlIdRows.map((r) => r.url))
      : new Map();
    for (const row of leased) {
      row.resolvedUrlId = (row.meta && row.meta.urlId != null) ? row.meta.urlId : fallbackIds.get(row.url);
    }

    // Pre-check: crawl_queue rows can go stale between hydrate and run (an
    // UNRELATED job may have refreshed a queued URL in the interim, since
    // organic crawls never touch crawl_queue). Skip re-fetching anything with
    // a very-recent (last 10 min) successful fetch and mark it complete
    // immediately — cheap, indexed point lookups, not a table scan.
    const urlIds = leased.map((r) => r.resolvedUrlId).filter((id) => id != null);
    const outcomes = urlIds.length ? selectHttpOutcomesForUrlIds(handle, urlIds) : new Map();
    const FRESH_ENOUGH_MS = 10 * 60 * 1000;
    const freshCutoffIso = new Date(Date.now() - FRESH_ENOUGH_MS).toISOString().slice(0, 19).replace('T', ' ');
    const toFetch = [];
    const preSkipped = [];
    for (const row of leased) {
      const lastFetch = row.resolvedUrlId != null ? outcomes.get(row.resolvedUrlId) : null;
      if (lastFetch && lastFetch >= freshCutoffIso) {
        await adapter.markComplete(row.url);
        preSkipped.push(row.url);
      } else {
        toFetch.push(row);
      }
    }
    if (!toFetch.length) {
      const stats = await adapter.getStats();
      return { earlyResult: { host, dequeued: leased.length, preSkippedFresh: preSkipped.length, fetched: 0, completed: 0, failed: 0, stats } };
    }

    const jobStartUrl = toFetch[0].url;
    const seedUrls = toFetch.slice(1).map((r) => r.url);
    // Snapshot BEFORE the job starts: reconciliation's redirect fallback only
    // trusts http_responses rows created after this id — an indexed PK range
    // over just the job's own rows, and no timestamp comparison at all (the
    // mixed-date-format trap never enters the picture).
    const { getMaxHttpResponseId } = require('news-crawler-db');
    const preJobMaxResponseId = getMaxHttpResponseId(handle);
    let jobId, job;
    try {
      ({ jobId, job } = inProcessCrawlJobRegistry.startOperation({
        logger: console,
        operationName: 'basicArticleCrawl',
        startUrl: jobStartUrl,
        overrides: {
          seedUrls,
          maxDepth: 0,        // no discovery — fetch ONLY the seeded batch
          useSitemap: false,
          preferCache: false, // these are due-for-refresh URLs; never serve stale cache
          maxDownloads: toFetch.length,
          maxPages: toFetch.length,
          crawlType: 'basic'
        }
      }));
    } catch (err) {
      // Job could not start (e.g. JOB_CONFLICT/409, allowMultiJobs=false and
      // another job is running) — the leased rows were never attempted, so
      // return them to pending rather than leaving them stuck in-progress.
      for (const row of toFetch) await adapter.returnToPending(row.url);
      const wrapped = new Error(err.message);
      wrapped.statusCode = err.statusCode || 500;
      wrapped.payload = {
        error: err.message,
        dequeued: leased.length,
        preSkippedFresh: preSkipped.length,
        returnedToPending: toFetch.length
      };
      throw wrapped;
    }

    // Job forked and fetching. Reconciliation is deferred to reconcileHostJob so
    // the caller can start OTHER hosts' jobs before this one finishes.
    return { ctx: { host, adapter, handle, toFetch, dequeued: leased.length, preSkippedFresh: preSkipped.length, jobId, job, preJobMaxResponseId } };
  }

  // reconcileHostJob assumes the caller has already awaited the job's
  // completion (waitHostJob) — it verifies via real http_responses rows, never
  // the crawl-side counters. Separating the wait (async, parallelizable) from
  // the reconcile (synchronous DB, must be serialized) is what lets run-multi
  // reconcile hosts in COMPLETION order without one slow host blocking others.
  // Wait for a host's job to settle, aborting EARLY when a guarded stuck-monitor
  // says it's host-specifically stuck (task #43). Returns {reason}:
  //   'finished' — job completed/failed on its own (reconcile normally)
  //   'stuck'    — measured stall: EWMA/downloads frozen while a sibling advances
  //   'timedOut' — hit the absolute wait-cap (the blind fallback / lone-host case)
  // 'stuck' and 'timedOut' both mean the caller aborts + returns un-fetched rows
  // to pending; 'finished' reconciles as-is.
  async function waitHostJob(jobId, capMs, monitor, toFetchLen) {
    if (!(capMs > 0)) {
      // Single-host callers (/run, place-hubs): just await settlement.
      try { await inProcessCrawlJobRegistry.waitForJob(jobId); } catch (_) {}
      return { reason: 'finished', timedOut: false };
    }
    const POLL_MS = 5000;
    const deadline = Date.now() + capMs;
    let done = false;
    // waitForJob resolves on completion AND rejects on failure — either way the
    // job is SETTLED, so both branches set done.
    inProcessCrawlJobRegistry.waitForJob(jobId).then(() => { done = true; }, () => { done = true; });
    while (!done && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, Math.max(0, Math.min(POLL_MS, deadline - Date.now()))));
      if (done) break;
      if (monitor && toFetchLen != null && monitor.isStuck(jobId, toFetchLen)) {
        return { reason: 'stuck', timedOut: true };
      }
    }
    return done ? { reason: 'finished', timedOut: false } : { reason: 'timedOut', timedOut: true };
  }

  async function reconcileHostJob(ctx, { aborted = false } = {}) {
    const { host, adapter, handle, toFetch, dequeued, preSkippedFresh, jobId, job, preJobMaxResponseId } = ctx;
    const { selectHttpOutcomesForUrlIds, selectRedirectedOutcomesSince } = require('news-crawler-db');
    const finished = inProcessCrawlJobRegistry.get(jobId);
    // job.startedAt is ISO form ('...T...Z'); selectHttpOutcomesForUrlIds always
    // returns space-form (SQLite datetime() output). A raw JS string compare of
    // the two mismatched formats reproduces the exact mixed-format trap the
    // ncdb differential-e2e test guards against — normalize before comparing.
    const rawSinceIso = (finished && finished.startedAt) || job.startedAt;
    const sinceIso = new Date(rawSinceIso).toISOString().slice(0, 19).replace('T', ' ');
    const toFetchIds = toFetch.map((r) => r.resolvedUrlId).filter((id) => id != null);
    const postOutcomes = toFetchIds.length ? selectHttpOutcomesForUrlIds(handle, toFetchIds) : new Map();
    // Redirect fallback (found live 2026-07-20, P5 Al Jazeera case): a seeded
    // URL the site redirects gets its 200 recorded under the redirect
    // TARGET's url_id, so the direct url_id lookup above finds nothing and a
    // real success would be marked failed. FetchPipeline stores the requested
    // URL in http_responses.redirect_chain, so before failing anything,
    // check whether a successful during-job response's chain names it.
    const redirectOutcomes = selectRedirectedOutcomesSince(handle, preJobMaxResponseId);
    let completed = 0, failed = 0, returnedToPending = 0;
    const errors = [];
    const redirected = [];
    for (const row of toFetch) {
      const lastFetch = row.resolvedUrlId != null ? postOutcomes.get(row.resolvedUrlId) : null;
      if (lastFetch && lastFetch >= sinceIso) {
        await adapter.markComplete(row.url);
        completed += 1;
        continue;
      }
      const viaRedirect = redirectOutcomes.get(row.url);
      if (viaRedirect) {
        await adapter.markComplete(row.url);
        completed += 1;
        redirected.push({ url: row.url, finalUrlId: viaRedirect.finalUrlId });
        continue;
      }
      // No successful http_responses row for this URL. If the job was ABORTED
      // by the wait-cap, the URL was very likely never attempted (a slow host
      // still had it queued) — return it to PENDING so it's retried on a later
      // crawl, NOT markFailed (which would waste the lease and hide the URL).
      // For a genuinely-finished/failed job, markFailed is correct (it was
      // attempted and produced no success).
      if (aborted) {
        await adapter.returnToPending(row.url);
        returnedToPending += 1;
      } else {
        await adapter.markFailed(row.url, { message: `no successful http_responses row observed since job start (job status: ${finished ? finished.status : 'unknown'})` });
        failed += 1;
        errors.push({ url: row.url, reason: 'no-successful-fetch-observed' });
      }
    }

    const stats = await adapter.getStats();
    return {
      host,
      dequeued,
      preSkippedFresh,
      fetched: toFetch.length,
      completed,
      completedViaRedirect: redirected.length,
      redirected,
      failed,
      returnedToPending,
      aborted: !!aborted,
      jobId,
      jobStatus: finished ? finished.status : null,
      errors,
      stats
    };
  }

  // Thin wrapper for single-host callers (/run, place-hubs redownload): start,
  // wait, reconcile inline. Behavior identical to the pre-split function (no
  // wait-cap — a single-host caller genuinely wants the full result).
  async function runFrontierJobForHost(args) {
    const started = await startHostJob(args);
    if (started.earlyResult) return started.earlyResult;
    await waitHostJob(started.ctx.jobId, 0);
    return reconcileHostJob(started.ctx);
  }

  unifiedApp.post('/api/v1/crawl/frontier/run', async (req, res) => {
    const adapter = await getFrontierQueueAdapter().catch((err) => {
      res.status(500).json({ error: err.message });
      return null;
    });
    if (!adapter) return;

    const host = req.body && req.body.host ? String(req.body.host).trim() : null;
    if (!host) return res.status(400).json({ error: 'host is required (e.g. "www.thehindu.com")' });
    // Cap raised 20→100 (2026-07-20): the "first concurrent phase" 20-limit is
    // outgrown — the machinery is proven across dozens of runs, and large
    // sustained crawls need to drain more of the frontier per leg (a host has
    // 100k+ never-downloaded URLs). Politeness stays enforced by the 1.8 MB/s
    // global cap + per-host rate limits regardless of this count.
    const limit = Math.max(1, Math.min(100, Number(req.body.limit) || 15));
    const facade = getDbRW();
    const handle = facade && facade.db ? facade.db : facade;

    try {
      const result = await runFrontierJobForHost({ host, limit, adapter, handle });
      res.json(result);
    } catch (err) {
      res.status(err.statusCode || 500).json(err.payload || { error: err.message });
    }
  });

  // ── P5: on-demand place-hub redownload ──────────────────────────────────
  // "Refetch everything we know about place X, right now" — force-enqueues
  // (recency bypassed: this IS the recency override) every known hub/mapping
  // URL for a place via selectPlaceHubUrlsForPlace (ncdb; merges
  // place_page_mappings + place_hubs, homonym- and dedupe-safe — see that
  // file's header), then drives the SAME per-host job machinery P4 uses
  // (runFrontierJobForHost above), one host at a time since forked crawl
  // jobs are per-host (see the plan's "orchestrator-of-per-host-jobs"
  // decision) and P4's own job-start error handling already assumes only one
  // job runs at a time. A place can span multiple hosts (a country hub on
  // three different news sites) — hosts are processed sequentially, in job
  // order, not concurrently.
  //
  // Guarded by RedownloadCooldownGuard against re-click storms: a click (or
  // a retry loop) for the SAME placeId within the cooldown window gets a 429
  // + Retry-After instead of spinning up another crawl job.
  const placeHubRedownloadCooldown = new RedownloadCooldownGuard({ cooldownMs: 5 * 60 * 1000 });

  // The per-place redownload CORE, extracted (TECH-P5AUTO, cycle 153) so the
  // manual route and the staleness-driven refresh share one implementation —
  // enqueue semantics, priorities, and the P4 per-host machinery can never
  // drift between the two entry points. Cooldown/HTTP concerns stay with the
  // callers (the manual route 429s; the scheduler silently skips).
  async function redownloadPlaceHubsCore({ placeId, adapter, handle }) {
    const { selectPlaceHubUrlsForPlace } = require('news-crawler-db');
    const frontier = selectPlaceHubUrlsForPlace(handle, placeId);
    if (!frontier.found) return { found: false, placeId };
    if (!frontier.items.length) {
      return { found: true, placeId, placeKind: frontier.placeKind, knownUrls: 0, requeued: 0, hosts: [], hostsRun: [], message: 'no known hub/mapping URLs for this place — nothing to redownload' };
    }

    // Recency is bypassed BY CONSTRUCTION: force any existing completed/failed
    // queue row back to pending (same rule P3's hydrate route uses for hubs —
    // a redownload is definitionally "re-fetch even if fetch-once policy
    // would normally block it"), then enqueue. An already-pending/in-progress
    // row is left alone (don't duplicate work already in flight).
    const HUB_PRIORITY = 50; // place hubs are hub-priority, matching P3's hub kind
    let requeued = 0;
    for (const item of frontier.items) {
      const existing = await adapter.get(item.url);
      if (existing && (existing.status === 'completed' || existing.status === 'failed')) {
        await adapter.returnToPending(item.url);
        requeued += 1;
      }
    }
    await adapter.enqueueBatch(frontier.items.map((item) => ({
      url: item.url,
      domain: item.host,
      priority: HUB_PRIORITY,
      meta: { kind: 'place-hub-redownload', source: item.source, urlId: item.urlId, placeId }
    })));

    // Run per-host, sequentially — reuses P4's exact machinery, one job per
    // host represented in this place's hub set.
    const hosts = Array.from(new Set(frontier.items.map((i) => i.host).filter(Boolean)));
    const hostsRun = [];
    for (const host of hosts) {
      try {
        const result = await runFrontierJobForHost({ host, limit: 20, adapter, handle });
        hostsRun.push(result);
      } catch (err) {
        hostsRun.push({ host, error: err.message, ...(err.payload || {}) });
      }
    }

    return { found: true, placeId, placeKind: frontier.placeKind, knownUrls: frontier.items.length, requeued, hosts, hostsRun };
  }

  unifiedApp.post('/api/v1/crawl/place-hubs/redownload', async (req, res) => {
    const placeId = Number(req.body && req.body.placeId);
    if (!Number.isInteger(placeId) || placeId <= 0) {
      return res.status(400).json({ error: 'placeId is required (numeric places.id)' });
    }

    const cooldownKey = `place:${placeId}`;
    const cooldown = placeHubRedownloadCooldown.check(cooldownKey);
    if (cooldown.locked) {
      res.set('Retry-After', String(Math.ceil(cooldown.retryAfterMs / 1000)));
      return res.status(429).json({
        error: 'redownload already triggered for this place recently',
        retryAfterMs: cooldown.retryAfterMs,
        retryAt: new Date(cooldown.retryAt).toISOString()
      });
    }

    const adapter = await getFrontierQueueAdapter().catch((err) => {
      res.status(500).json({ error: err.message });
      return null;
    });
    if (!adapter) return;

    const facade = getDbRW();
    const handle = facade && facade.db ? facade.db : facade;
    const result = await redownloadPlaceHubsCore({ placeId, adapter, handle });
    if (!result.found) {
      return res.status(404).json({ error: `no place found for placeId ${placeId}` });
    }
    if (result.knownUrls > 0) placeHubRedownloadCooldown.note(cooldownKey);

    const { found, ...payload } = result;
    res.json(payload);
  });

  // ── TECH-P5AUTO (cycle 153, owner-signalled): staleness-driven refresh ────
  // One call finds the most-starved places (ncdb selectStalePlaceHubCandidates:
  // place_page_mappings-driven selection, frontier hub-recency conventions —
  // success = 200/304, datetime() both sides, dead-hub latest-N rule) and runs
  // the SAME per-place core the manual route uses. Cooldown-locked places are
  // SKIPPED, not 429'd — a batch keeps going past a recently-clicked place.
  // dryRun previews candidates with zero side effects.
  async function refreshStalePlaceHubs({ staleHours, maxPlaces }) {
    const { selectStalePlaceHubCandidates } = require('news-crawler-db');
    const facade = getDbRW();
    const handle = facade && facade.db ? facade.db : facade;
    // Headroom over maxPlaces so cooldown-locked candidates don't starve the batch.
    const selection = selectStalePlaceHubCandidates(handle, { staleHours, limit: maxPlaces * 2 });

    const adapter = await getFrontierQueueAdapter();
    const run = [];
    const skippedCooldown = [];
    for (const candidate of selection.candidates) {
      if (run.length >= maxPlaces) break;
      const cooldownKey = `place:${candidate.placeId}`;
      if (placeHubRedownloadCooldown.check(cooldownKey).locked) {
        skippedCooldown.push(candidate.placeId);
        continue;
      }
      const result = await redownloadPlaceHubsCore({ placeId: candidate.placeId, adapter, handle });
      if (result.found && result.knownUrls > 0) placeHubRedownloadCooldown.note(cooldownKey);
      run.push({ ...result, name: candidate.name, freshestFetch: candidate.freshestFetch, neverFetched: candidate.neverFetched });
    }

    return {
      staleHours: selection.staleHours,
      cutoff: selection.cutoff,
      scannedPlaces: selection.scannedPlaces,
      considered: selection.candidates.length,
      run,
      skippedCooldown
    };
  }

  unifiedApp.post('/api/v1/crawl/place-hubs/refresh-stale', async (req, res) => {
    try {
      const body = req.body || {};
      const staleHours = Number.isFinite(Number(body.staleHours)) && Number(body.staleHours) > 0
        ? Number(body.staleHours) : 24;
      const maxPlaces = Math.max(1, Math.min(10, Number(body.maxPlaces) || 2));

      if (body.dryRun) {
        const { selectStalePlaceHubCandidates } = require('news-crawler-db');
        const facade = getDbRW();
        const handle = facade && facade.db ? facade.db : facade;
        return res.json({ dryRun: true, ...selectStalePlaceHubCandidates(handle, { staleHours, limit: maxPlaces * 2 }) });
      }

      res.json(await refreshStalePlaceHubs({ staleHours, maxPlaces }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // The SCHEDULER half of TECH-P5AUTO, mirroring auto-hydrate's shape exactly:
  // persisted settings, default DISABLED (behavior unchanged until the owner
  // enables it), a 60s meta-timer gated by intervalMinutes, a tick guard, and
  // GET/POST settings routes + a deterministic on-demand tick for live
  // verification. Bounds are deliberately modest — a tick refreshes at most
  // maxPlaces places (≈5 hub URLs each), and every fetch still rides the full
  // politeness machinery, so an enabled scheduler is a trickle, not a crawl.
  const PLACE_HUB_REFRESH_DEFAULTS = { enabled: false, intervalMinutes: 360, staleHours: 24, maxPlaces: 2 };
  function currentPlaceHubRefresh() {
    const saved = readCrawlSettings().placeHubRefresh || {};
    return {
      enabled: saved.enabled === true,
      intervalMinutes: Number.isFinite(Number(saved.intervalMinutes)) && Number(saved.intervalMinutes) >= 30
        ? Number(saved.intervalMinutes) : PLACE_HUB_REFRESH_DEFAULTS.intervalMinutes,
      staleHours: Number.isFinite(Number(saved.staleHours)) && Number(saved.staleHours) > 0
        ? Number(saved.staleHours) : PLACE_HUB_REFRESH_DEFAULTS.staleHours,
      maxPlaces: Math.max(1, Math.min(10, Number(saved.maxPlaces) || PLACE_HUB_REFRESH_DEFAULTS.maxPlaces))
    };
  }

  let _placeHubRefreshLastTick = 0;
  let _placeHubRefreshTicking = false;
  let _placeHubRefreshLastResult = null;
  async function placeHubRefreshTick(settings) {
    if (_placeHubRefreshTicking) return { skipped: 'tick-in-progress' };
    _placeHubRefreshTicking = true;
    try {
      const outcome = await refreshStalePlaceHubs({ staleHours: settings.staleHours, maxPlaces: settings.maxPlaces });
      _placeHubRefreshLastTick = Date.now();
      _placeHubRefreshLastResult = { tickedAt: new Date(_placeHubRefreshLastTick).toISOString(), ...outcome };
      return _placeHubRefreshLastResult;
    } finally {
      _placeHubRefreshTicking = false;
    }
  }

  const _placeHubRefreshTimer = setInterval(async () => {
    try {
      const settings = currentPlaceHubRefresh();
      if (!settings.enabled) return;
      if (Date.now() - _placeHubRefreshLastTick < settings.intervalMinutes * 60 * 1000) return;
      await placeHubRefreshTick(settings);
    } catch (_) { /* best-effort; retried next minute */ }
  }, 60 * 1000);
  if (typeof _placeHubRefreshTimer.unref === 'function') _placeHubRefreshTimer.unref();

  unifiedApp.get('/api/v1/crawl/place-hub-refresh', (req, res) => {
    res.json({
      ...currentPlaceHubRefresh(),
      lastTickAt: _placeHubRefreshLastTick ? new Date(_placeHubRefreshLastTick).toISOString() : null,
      lastResult: _placeHubRefreshLastResult
    });
  });

  unifiedApp.post('/api/v1/crawl/place-hub-refresh', (req, res) => {
    try {
      const body = req.body || {};
      const patch = {};
      if (body.enabled !== undefined) patch.enabled = body.enabled === true;
      if (body.intervalMinutes !== undefined) patch.intervalMinutes = Number(body.intervalMinutes);
      if (body.staleHours !== undefined) patch.staleHours = Number(body.staleHours);
      if (body.maxPlaces !== undefined) patch.maxPlaces = Number(body.maxPlaces);
      writeCrawlSettings({ placeHubRefresh: Object.assign({}, readCrawlSettings().placeHubRefresh || {}, patch) });
      res.json(currentPlaceHubRefresh());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Deterministic on-demand tick — the live-verification hook.
  unifiedApp.post('/api/v1/crawl/place-hub-refresh/tick', async (req, res) => {
    try {
      res.json(await placeHubRefreshTick(currentPlaceHubRefresh()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ── P6 (slice 1): bounded concurrent multi-host frontier runs ────────────
  // One call drains pending crawl_queue work across several hosts AT ONCE:
  // picks up to maxHosts hosts fairly (highest pending priority first — hub
  // batches beat article batches — then volume; or an explicit hosts list),
  // then runs runFrontierJobForHost for each CONCURRENTLY. Safe by
  // construction: dequeue is scoped per host (no two jobs contend for the
  // same rows), the registry runs with allowMultiJobs, each job forks its
  // own worker, and the demand-aware bandwidth slices (computeDemandSlices,
  // Σ=cap) already coordinate multiple concurrent workers — that machinery
  // was built and choke-tested in the bandwidth-cap cycle precisely so a
  // fleet of workers shares the global cap. Caps are deliberately modest
  // (maxHosts<=4, perHostLimit<=20) for this first concurrent phase.
  unifiedApp.post('/api/v1/crawl/frontier/run-multi', async (req, res) => {
    const adapter = await getFrontierQueueAdapter().catch((err) => {
      res.status(500).json({ error: err.message });
      return null;
    });
    if (!adapter) return;

    // maxHosts cap 8 (re-raised 2026-07-20 pm AFTER the dispatch-and-return +
    // serial-reconcile fix below): the 8→4 revert was a stopgap for the wedge
    // (8-way CONCURRENT synchronous reconciliation on one WAL handle starved the
    // accept loop). Now reconciliation is SERIALIZED (parallel fetch in forked
    // workers, one reconciliation at a time with a setImmediate yield between
    // hosts) so concurrency no longer piles synchronous DB work on the event
    // loop — 8 hosts is safe again and lifts fetch parallelism. The electron
    // watchdog remains the backstop if a wedge ever recurs.
    const maxHosts = Math.max(1, Math.min(8, Number(req.body && req.body.maxHosts) || 3));
    const perHostLimit = Math.max(1, Math.min(100, Number(req.body && req.body.perHostLimit) || 10));
    const facade = getDbRW();
    const handle = facade && facade.db ? facade.db : facade;

    let hosts;
    if (Array.isArray(req.body && req.body.hosts) && req.body.hosts.length) {
      // Explicit host list = the caller has decided; rotation does not apply.
      hosts = req.body.hosts.map((h) => String(h).trim()).filter(Boolean).slice(0, maxHosts);
    } else {
      // P6 slice 2: cross-turn rotation fairness. Over-fetch candidates so a
      // recently-run top host can yield to untouched lower-ranked ones —
      // otherwise the biggest hub backlog wins EVERY call and other hosts
      // starve. In-memory recency is deliberate soft state (restart loses one
      // round of fairness, nothing else).
      const candidates = await adapter.getPendingHosts({ limit: Math.min(50, maxHosts * 4) });
      hosts = pickRotatedHosts(candidates, _frontierHostTouched, maxHosts);
    }
    if (!hosts.length) {
      return res.json({ hosts: [], message: 'no hosts with pending work — call /api/v1/crawl/frontier/hydrate first' });
    }

    // Dispatch-and-return (2026-07-20 wedge fix): the OLD path awaited
    // Promise.all(runFrontierJobForHost...) — every host's SYNCHRONOUS
    // reconciliation ran concurrently on the one WAL handle and the client held
    // the connection for the whole multi-minute crawl (frontier-fill timed out
    // at 120s while downloads actually succeeded). Now: return a batchId
    // immediately; start all host jobs CONCURRENTLY (parallel fetch in forked
    // workers, off the event loop) but reconcile SERIALLY with a setImmediate
    // yield between hosts so the accept loop is never starved. Poll status at
    // GET /api/v1/crawl/frontier/run-multi/:batchId.
    const batchId = require('crypto').randomUUID();
    const batch = { batchId, status: 'running', startedAt: new Date().toISOString(), hosts, maxHosts, perHostLimit, total: hosts.length, done: 0, results: [] };
    // Bound memory: drop finished batches older than 10 min before adding one.
    const batchCutoff = Date.now() - 10 * 60 * 1000;
    for (const [id, b] of frontierRunBatches) {
      if (b.finishedAt && new Date(b.finishedAt).getTime() < batchCutoff) frontierRunBatches.delete(id);
    }
    frontierRunBatches.set(batchId, batch);

    // A single stuck/slow host must not stall the whole batch, and finished
    // hosts must not wait behind it (head-of-line blocking). So: start all jobs
    // concurrently, wait for EACH in parallel (bounded by WAIT_CAP), and
    // reconcile in COMPLETION order — serialized through one lock so only one
    // synchronous better-sqlite3 reconcile runs at a time (the wedge fix).
    // Per-batch latency budget: a caller can set a tighter wait-cap for a
    // tight-latency batch (a slow host is then aborted sooner + its rows
    // returned to pending for a later crawl). Bounded 5s..10min; default 4min.
    const WAIT_CAP_MS = Math.max(5000, Math.min(10 * 60 * 1000, Number(req.body && req.body.waitCapMs) || 4 * 60 * 1000));
    // After the wait-cap fires we ABORT the stuck job, then AWAIT its real
    // settlement before reconciling. registry.stop() is fire-and-forget, so we
    // must wait for the worker to actually exit + flush its in-flight fetch to
    // http_responses — else reconcile races the still-draining worker and
    // returns-to-pending a page that was about to land (a wasted re-fetch).
    // The registry escalates to child.kill() at 30s, so the grace MUST exceed
    // that (35s) to guarantee the worker is gone; a cooperative worker settles
    // in <8s (NewsCrawler.stopAsync timeout) so this rarely waits the full cap.
    const WAIT_CAP_GRACE_MS = 35 * 1000;
    // Adaptive per-host limit (task #45): a slow-crawl-delay host (e.g. Guardian
    // ~33s between fetches, working-as-intended robots politeness) leased with
    // the same uniform limit as a fast host OVER-leases — it can only politely
    // fetch a few in the batch window, so the rest return to pending and pile up
    // (36 Guardian rows observed), and it gates batch wall-clock. Size each
    // host's leased count to what it can fetch in ~80% of the wait-cap at its
    // MEASURED median gap (ncdb selectRecentHostFetchGapMedians — read-only). We
    // only shrink the COUNT for slow hosts; the crawl-delay itself is NEVER
    // touched, so politeness is unchanged. Unknown/fast hosts keep perHostLimit.
    const { selectRecentHostFetchGapMedians } = require('news-crawler-db');
    let hostGapMedians = new Map();
    try { hostGapMedians = selectRecentHostFetchGapMedians(handle, { sinceMinutes: 45 }); } catch (_) { hostGapMedians = new Map(); }
    const limitForHost = (host) => {
      const gapMs = hostGapMedians.get(host) || hostGapMedians.get(String(host).replace(/^www\./, '')) || hostGapMedians.get('www.' + host);
      if (!gapMs || gapMs < 5000) return perHostLimit; // fast/unknown host → full limit
      return Math.max(2, Math.min(perHostLimit, Math.floor((WAIT_CAP_MS * 0.8) / gapMs)));
    };
    const hostLimits = Object.fromEntries(hosts.map((h) => [h, limitForHost(h)]));
    batch.hostLimits = hostLimits; // observability: shows adaptive sizing per host
    (async () => {
      // Phase 1: start every host's job concurrently (parallel fetching), each
      // with its adaptive limit so no host over-leases.
      const started = await Promise.all(hosts.map((host) =>
        startHostJob({ host, limit: hostLimits[host], adapter, handle })
          .then((s) => ({ host, ...s }))
          .catch((err) => ({ host, thrown: err }))
      ));
      // Phase 2: each host waits for its own job (parallel), then reconciles
      // through the shared lock the moment it's ready — completion order.
      // The stuck-monitor watches ALL started jobs so a host that goes silent
      // while a sibling is still emitting is aborted EARLY (measured trigger),
      // but a whole-process freeze (all silent) aborts nobody — see stuckMonitor.js.
      const { createStuckMonitor } = require('./stuckMonitor');
      const monitorJobIds = started.filter((s) => s.ctx && s.ctx.jobId).map((s) => s.ctx.jobId);
      const stuckMonitor = createStuckMonitor(monitorJobIds, (id) => inProcessCrawlJobRegistry.get(id));
      let reconcileLock = Promise.resolve();
      await Promise.all(started.map((s) => (async () => {
        _frontierHostTouched.set(s.host, Date.now());
        if (s.thrown) { batch.results.push({ host: s.host, error: s.thrown.message, ...(s.thrown.payload || {}) }); batch.done += 1; return; }
        if (s.earlyResult) { batch.results.push(s.earlyResult); batch.done += 1; return; }
        const w = await waitHostJob(s.ctx.jobId, WAIT_CAP_MS, stuckMonitor, s.ctx.toFetch.length);
        let aborted = false;
        if (w.reason !== 'finished') {
          // Measured-stuck ('stuck') or absolute-cap ('timedOut'): abort the
          // lingering worker so it stops holding a slot + downloading past the
          // batch, then let it flush in-flight writes before reconciling.
          try { inProcessCrawlJobRegistry.stop(s.ctx.jobId); } catch (_) {}
          await waitHostJob(s.ctx.jobId, WAIT_CAP_GRACE_MS);
          aborted = true;
        }
        reconcileLock = reconcileLock.then(async () => {
          try { const r = await reconcileHostJob(s.ctx, { aborted }); if (aborted) r.abortReason = w.reason; batch.results.push(r); }
          catch (err) { batch.results.push({ host: s.host, error: err.message }); }
          batch.done += 1;
          await new Promise((r) => setImmediate(r));
        });
        await reconcileLock;
      })()));
      batch.totals = batch.results.reduce((a, r) => ({
        fetched: a.fetched + (r.fetched || 0),
        completed: a.completed + (r.completed || 0),
        completedViaRedirect: a.completedViaRedirect + (r.completedViaRedirect || 0),
        failed: a.failed + (r.failed || 0),
        returnedToPending: a.returnedToPending + (r.returnedToPending || 0)
      }), { fetched: 0, completed: 0, completedViaRedirect: 0, failed: 0, returnedToPending: 0 });
      batch.stats = await adapter.getStats().catch(() => null);
      batch.status = 'done';
      batch.finishedAt = new Date().toISOString();
    })().catch((e) => { batch.status = 'error'; batch.error = e && e.message; batch.finishedAt = new Date().toISOString(); });

    return res.status(202).json({ batchId, hosts, maxHosts, perHostLimit, status: 'running', total: hosts.length, poll: `/api/v1/crawl/frontier/run-multi/${batchId}` });
  });

  // Poll a dispatch-and-return run-multi batch (status: running|done|error).
  unifiedApp.get('/api/v1/crawl/frontier/run-multi/:batchId', (req, res) => {
    const batch = frontierRunBatches.get(req.params.batchId);
    if (!batch) return res.status(404).json({ error: 'unknown batchId (expired after 10 min, or never existed)' });
    return res.json(batch);
  });

  // ── P6 (slice 2): periodic auto-re-hydration ─────────────────────────────
  // Keeps crawl_queue topped up from the DB frontier WITHOUT any fetching —
  // running crawls stays an explicit action (run-multi / place-hub
  // redownload). The due-frontier read runs in a CHILD process
  // (tools/crawl/frontier-due.js) per the P3-review constraint: it walks the
  // full ~6.4k hub-id set before the host filter, which must not block the
  // server's synchronous better-sqlite3 event loop on a timer. Only the
  // cheap enqueue writes happen here, on the orchestrator's single adapter
  // connection (the same claim-safety boundary P4 established). Host choice
  // rotates via the same soft-state fairness as run-multi (separate map —
  // hydration recency and run recency are different things). Persisted
  // settings follow the bandwidth-cap pattern; default DISABLED so behavior
  // is unchanged until explicitly enabled.
  const _frontierHostTouched = new Map();     // run-multi rotation state
  const frontierRunBatches = new Map();       // dispatch-and-return run-multi batches (batchId → status)
  const _autoHydrateTouched = new Map();      // hydration rotation state
  const AUTO_HYDRATE_DEFAULTS = { enabled: false, intervalMinutes: 30, hostsPerTick: 2, perHostLimit: 10, newsHostsOnly: true };
  function currentAutoHydrate() {
    const saved = readCrawlSettings().autoHydrate || {};
    return {
      enabled: saved.enabled === true,
      intervalMinutes: Number.isFinite(Number(saved.intervalMinutes)) && Number(saved.intervalMinutes) >= 5
        ? Number(saved.intervalMinutes) : AUTO_HYDRATE_DEFAULTS.intervalMinutes,
      hostsPerTick: Math.max(1, Math.min(5, Number(saved.hostsPerTick) || AUTO_HYDRATE_DEFAULTS.hostsPerTick)),
      perHostLimit: Math.max(1, Math.min(50, Number(saved.perHostLimit) || AUTO_HYDRATE_DEFAULTS.perHostLimit)),
      // News-first by DEFAULT: the frontier's top-hosts list is host-agnostic
      // (the first live tick picked en.wikipedia.org), so automated hydration
      // only feeds hosts curated in news_websites unless explicitly opened up.
      newsHostsOnly: saved.newsHostsOnly !== false
    };
  }

  function fetchDueViaChild(host, limit, recencyMs) {
    return new Promise((resolve) => {
      try {
        const { spawn } = require('child_process');
        const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
        const child = spawn(process.execPath, [
          path.join(repoRoot, 'tools', 'crawl', 'frontier-due.js'),
          '--host', host, '--limit', String(limit), '--recency-ms', String(recencyMs)
        ], { cwd: repoRoot, windowsHide: true });
        let out = '';
        child.stdout.on('data', (c) => { out += c.toString(); });
        child.stdout.on('error', () => { /* async stdout read error (EPIPE etc.): degrade, never crash the server child */ });
        child.on('exit', () => {
          try { resolve(JSON.parse(out)); } catch (_) { resolve(null); }
        });
        child.on('error', () => resolve(null));
        setTimeout(() => { try { child.kill(); } catch (_) {} resolve(null); }, 60000);
      } catch (_) { resolve(null); }
    });
  }

  let _autoHydrateLastTick = 0;
  let _autoHydrateTicking = false;
  async function autoHydrateTick(settings) {
    if (_autoHydrateTicking) return { skipped: 'tick-in-progress' };
    _autoHydrateTicking = true;
    try {
      const snapshot = frontierStats.data;
      if (!snapshot || !Array.isArray(snapshot.hosts) || !snapshot.hosts.length) {
        return { skipped: 'no-frontier-snapshot-yet' };
      }
      const adapter = await getFrontierQueueAdapter();
      // News-host policy filter BEFORE rotation (policy decides the candidate
      // pool; rotation decides fairness within it). SQL + matching live in
      // ncdb (selectEnabledNewsHostTokens / hostMatchesNewsTokens); 48-row
      // read, fine in-tick.
      let candidates = snapshot.hosts;
      let filteredOut = [];
      if (settings.newsHostsOnly) {
        const { selectEnabledNewsHostTokens, hostMatchesNewsTokens } = require('news-crawler-db');
        const facade = getDbRW();
        const handle = facade && facade.db ? facade.db : facade;
        const tokens = selectEnabledNewsHostTokens(handle);
        filteredOut = candidates.filter((h) => !hostMatchesNewsTokens(h.host, tokens)).map((h) => h.host);
        candidates = candidates.filter((h) => hostMatchesNewsTokens(h.host, tokens));
      }
      if (!candidates.length) {
        return { skipped: 'no-eligible-hosts', newsHostsOnly: settings.newsHostsOnly, filteredOut };
      }
      const hosts = pickRotatedHosts(candidates, _autoHydrateTouched, settings.hostsPerTick);
      const recencyMs = Math.round(currentHubRecencyDays() * 24 * 60 * 60 * 1000);
      const perHost = [];
      for (const host of hosts) {
        const due = await fetchDueViaChild(host, settings.perHostLimit, recencyMs);
        _autoHydrateTouched.set(host, Date.now());
        if (!due || !Array.isArray(due.items)) {
          perHost.push({ host, error: 'due-read-failed' });
          continue;
        }
        const outcome = await enqueueDueItems(adapter, due.items, 'auto-hydrate');
        perHost.push({ host, computeMs: due.computeMs, ...outcome });
      }
      _autoHydrateLastTick = Date.now();
      return {
        tickedAt: new Date(_autoHydrateLastTick).toISOString(),
        newsHostsOnly: settings.newsHostsOnly,
        filteredOut,
        hosts: perHost,
        stats: await adapter.getStats()
      };
    } finally {
      _autoHydrateTicking = false;
    }
  }

  const _autoHydrateTimer = setInterval(async () => {
    try {
      const settings = currentAutoHydrate();
      if (!settings.enabled) return;
      if (Date.now() - _autoHydrateLastTick < settings.intervalMinutes * 60 * 1000) return;
      await autoHydrateTick(settings);
    } catch (_) { /* best-effort; retried next minute */ }
  }, 60 * 1000);
  if (typeof _autoHydrateTimer.unref === 'function') _autoHydrateTimer.unref();

  unifiedApp.get('/api/v1/crawl/auto-hydrate', (req, res) => {
    res.json({
      ...currentAutoHydrate(),
      lastTickAt: _autoHydrateLastTick ? new Date(_autoHydrateLastTick).toISOString() : null
    });
  });

  unifiedApp.post('/api/v1/crawl/auto-hydrate', (req, res) => {
    try {
      const body = req.body || {};
      const patch = {};
      if (body.enabled !== undefined) patch.enabled = body.enabled === true;
      if (body.intervalMinutes !== undefined) patch.intervalMinutes = Number(body.intervalMinutes);
      if (body.hostsPerTick !== undefined) patch.hostsPerTick = Number(body.hostsPerTick);
      if (body.perHostLimit !== undefined) patch.perHostLimit = Number(body.perHostLimit);
      if (body.newsHostsOnly !== undefined) patch.newsHostsOnly = body.newsHostsOnly !== false;
      writeCrawlSettings({ autoHydrate: Object.assign({}, readCrawlSettings().autoHydrate || {}, patch) });
      res.json(currentAutoHydrate());
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Deterministic on-demand tick — the live-verification hook, and useful
  // manually ("top up the queue now") without waiting for the interval.
  unifiedApp.post('/api/v1/crawl/auto-hydrate/tick', async (req, res) => {
    try {
      res.json(await autoHydrateTick(currentAutoHydrate()));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crawl throughput windows (1h / 6h / 24h): pages, documents, MB downloaded,
  // MB stored-compressed. DB aggregation lives in ncdb (no raw SQL here);
  // ~180ms warm on the live DB, so serve fresh per poll.
  unifiedApp.get('/api/v1/crawl-throughput', (req, res) => {
    try {
      const { getCrawlThroughputWindows } = require('news-crawler-db');
      const facadeForTp = getDbRW();
      const handleForTp = facadeForTp && facadeForTp.db ? facadeForTp.db : facadeForTp;
      res.json(getCrawlThroughputWindows(handleForTp));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Crawl download-rate timeseries: per-minute downloaded bytes over the last
  // hour (zero-filled), for the mini-dashboard MB/s graph. ncdb-owned SQL.
  unifiedApp.get('/api/v1/crawl-rate-timeseries', (req, res) => {
    try {
      const { getCrawlRateTimeseries } = require('news-crawler-db');
      const facadeForRt = getDbRW();
      const handleForRt = facadeForRt && facadeForRt.db ? facadeForRt.db : facadeForRt;
      res.json(getCrawlRateTimeseries(handleForRt));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Latest headlines: the most-recently-analysed article titles (host + section),
  // so the crawl-status page shows the real news that just came in, not only
  // counts. DB read lives in ncdb (no raw SQL here); ~8ms warm on the live DB.
  unifiedApp.get('/api/v1/recent-headlines', (req, res) => {
    try {
      const { getRecentHeadlines } = require('news-crawler-db');
      const facadeForHl = getDbRW();
      const handleForHl = facadeForHl && facadeForHl.db ? facadeForHl.db : facadeForHl;
      const limit = Math.max(1, Math.min(60, Number(req.query.limit) || 15));
      res.json(getRecentHeadlines(handleForHl, { limit }));
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Unified crawl-dashboard model (distributed-crawl plan v2, Phase D4 slice 2a):
  // throughput + host-health + recent-headlines in ONE normalized shape, produced
  // by the shared LocalDataAdapter over the SAME core the future jsgui3 dashboard
  // controls (local page + remote panel) consume — so there is one implementation
  // of the cycle-69 active-only/producer-trusting throughput math. The source here
  // is DIRECT (in-process): it reuses the exact data the /api/v1/crawl/jobs,
  // /host-health and /recent-headlines routes serve, with NO self-HTTP.
  unifiedApp.get('/api/v1/crawl/dashboard-model', async (req, res) => {
    try {
      const { LocalDataAdapter } = require('../../shared/crawl-dash-core/DashboardDataAdapter');
      const { getRecentHeadlines } = require('news-crawler-db');
      const facadeForDm = getDbRW();
      const handleForDm = facadeForDm && facadeForDm.db ? facadeForDm.db : facadeForDm;
      const limit = Math.max(1, Math.min(60, Number(req.query.limit) || 15));
      const source = {
        async fetchJobs() { return inProcessCrawlJobRegistry.list(); },
        async fetchHostHealth() {
          if (!hostHealth.data || Date.now() - hostHealth.generatedAt > 45 * 1000) refreshHostHealth();
          return { hosts: (hostHealth.data && hostHealth.data.hosts) || [], refreshing: hostHealth.refreshing };
        },
        async fetchHeadlines() { return getRecentHeadlines(handleForDm, { limit }); },
      };
      const model = await new LocalDataAdapter({ source }).getModel();
      res.json(model);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Per-article detail for the crawl-detail side-by-side grid (plan Phase 2, cycle 61):
  // title, publication date, word count, byline+authors, section, host, url, fetched_at,
  // place tags — per recently-analysed article, optionally scoped to a host + a time window
  // (since = a crawl's job.startedAt; the per-crawl grouping key, since download rows carry
  // no persisted job id). The DB read lives in ncdb (listRecentArticlesForDetail, index-pinned
  // ~8ms). Byline-as-title / hub-title NOISE is filtered HERE (copilot side) via the canonical
  // ArticleSignalsService.isArticleShapedUrl — that classifier stays in copilot, not ncdb; we
  // over-fetch so the post-filter still fills `limit`. HONEST: author is ~0% populated until the
  // extraction pipeline lands (plan Phase 5) and place tags are sparse — both are returned as-is.
  unifiedApp.get('/api/v1/crawl/recent-articles', (req, res) => {
    try {
      const { listRecentArticlesForDetail } = require('news-crawler-db');
      const { ArticleSignalsService } = require('news-crawler-itself/signals');
      const facade = getDbRW();
      const handle = facade && facade.db ? facade.db : facade;
      const limit = Math.max(1, Math.min(60, Number(req.query.limit) || 30));
      const host = req.query.host ? String(req.query.host) : undefined;
      const since = req.query.since ? String(req.query.since) : undefined;
      const until = req.query.until ? String(req.query.until) : undefined;
      const raw = listRecentArticlesForDetail(handle, {
        limit: Math.min(120, limit * 2), // over-fetch: the noise filter below drops some rows
        ...(host ? { host } : {}),
        ...(since ? { since } : {}),
        ...(until ? { until } : {})
      });
      const articles = raw
        .filter((a) => a && a.url && ArticleSignalsService.isArticleShapedUrl(a.url))
        .slice(0, limit);
      res.json({ status: 'ok', generatedAt: new Date().toISOString(), count: articles.length, articles });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Places-enrichment read surface (cycle 88): "which articles mention place X", backed by
  // the additive `article_place_mentions` table (FK-valid place_id, canonical English display
  // via places.canonical_name_id). ADDITIVE — does NOT repoint the legacy gazetteer place
  // page. All query logic lives in the tools/intelligence/place-articles.js module (no raw
  // SQL in this server file, so ncdb-debt is unchanged). ?place=<name> or ?placeId=<id>.
  unifiedApp.get('/api/v1/crawl/place-articles', (req, res) => {
    try {
      const { resolvePlaceIds, resolvePlaceById, listArticlesForPlace, coverageComparison } = require('../../../../tools/intelligence/place-articles.js');
      const facade = getDbRW();
      const handle = facade && facade.db ? facade.db : facade;
      const limit = Math.max(1, Math.min(50, Number(req.query.limit) || 15));
      const placeId = req.query.placeId ? Number(req.query.placeId) : null;
      const place = req.query.place ? String(req.query.place) : null;
      let targets = [];
      if (placeId) { const p = resolvePlaceById(handle, placeId); if (p) targets = [p]; }
      else if (place) { targets = resolvePlaceIds(handle, place).slice(0, 3); }
      else { return res.status(400).json({ error: 'provide ?place=<name> or ?placeId=<id>' }); }
      const results = targets.map((t) => ({
        place: t,
        coverage: coverageComparison(handle, t.place_id, t.name),
        articles: listArticlesForPlace(handle, t.place_id, limit),
      }));
      return res.json({ status: 'ok', generatedAt: new Date().toISOString(), query: { place, placeId, limit }, results });
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  });

  // Standalone mini crawl dashboard (~600x240): last-24h totals + live "+N"
  // heal-number feedback as pages download. Self-contained page (no shell);
  // open it in a small Electron/browser window. ?demo=1 exercises the animation.
  unifiedApp.get('/crawl-mini', (req, res) => {
    try {
      const { renderCrawlMiniPage } = require('./crawlMiniPage');
      res.set('Content-Type', 'text/html; charset=utf-8').send(renderCrawlMiniPage());
    } catch (err) {
      res.status(500).send('crawl-mini unavailable: ' + err.message);
    }
  });

  // In-app background-task subsystem (A7): a BackgroundTaskManager over the
  // app's own db handle + the IngestAdminAreasTask, so admin-area ingestion
  // runs IN-process (no app-stop dance). Non-fatal — the crawler must run
  // even if the task API can't mount.
  try {
    const { mountBackgroundTasks } = require('../../../server/background-tasks/mountBackgroundTasks');
    // Wire task progress into the live surfaces (2026-07-19): task:* frames
    // ride the existing /api/crawl-telemetry/events SSE (history replay +
    // heartbeats for free), and throttled progress persists to task_events
    // (TaskEventWriter) so task-events.js / Crawl Observer show analysis runs.
    let emitTelemetry;
    try {
      const { TaskEventWriter } = require('../../../db/TaskEventWriter');
      const facadeForTasks = getDbRW();
      const handleForTasks = facadeForTasks && facadeForTasks.db ? facadeForTasks.db : facadeForTasks;
      emitTelemetry = new TaskEventWriter(handleForTasks).createBackgroundTaskEmitter();
    } catch (telemetryErr) {
      console.warn('[unifiedApp] background-task telemetry unavailable:', telemetryErr.message);
    }
    mountBackgroundTasks(unifiedApp, getDbRW, {
      logger: console,
      broadcastEvent: (type, task) => {
        try {
          crawlTelemetry.bridge.emitEvent({ type: `task:${type}`, ts: new Date().toISOString(), data: task });
        } catch (_) { /* SSE broadcast is best-effort */ }
      },
      emitTelemetry
    });
  } catch (err) {
    console.warn('[unifiedApp] background-tasks API unavailable:', err.message);
  }

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
      id: 'place-hubs-table',
      mountPath: '/place-hubs-table',
      full: () => createPlaceHubsTableRouter({
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
      id: 'crawl-observer',
      mountPath: '/crawl-observer',
      full: () => createCrawlObserverRouter({
        getDbHandle: () => getDbRW()?.db
      })
    },
    // crawl-status retired 2026-08-04 (cycle 173): replaced by the Crawl Console
    // in ../news-crawler-ui (run: node tools/ui/run-crawl-console.js), deleted at
    // proven parity during the supervised session — launcher POST + live ACTIVE
    // verified in a real browser against this very server.
    {
      id: 'scheduler',
      mountPath: '/scheduler',
      apiOnly: () => createSchedulerDashboardRouter({ getDbRW, includeRootRoute: false }),
      full: () => createSchedulerDashboardRouter({ getDbRW })
    },
    {
      id: 'remote-crawl-admin',
      mountPath: '/remote-crawl',
      // Router source is not present in all checkouts; skip cleanly when absent
      // instead of error-logging on every boot (2026-07-07 electron-ui-loop c3).
      requiresModulePath: path.join(__dirname, '..', 'remoteCrawlAdmin', 'server.js'),
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
  ].filter((mod) => {
    if (mod.requiresModulePath && !fs.existsSync(mod.requiresModulePath)) {
      log.info(`[UnifiedApp] Skipping optional module ${mod.id}: source not present`, {
        moduleId: mod.id,
        missingPath: mod.requiresModulePath
      });
      return false;
    }
    return true;
  });

  const closers = [];
  closers.push(() => {
    try {
      if (downloadTicker) downloadTicker.destroy();
    } catch {
      // ignore
    }
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
      recentDownloads: [],
      monitoredSmallCrawl: {
        schemaVersion: 1,
        mode: 'monitored-small-crawl-report',
        readinessLabel: 'no-new-data',
        recent: { downloads: 0, success: 0, failed: 0, bytes: 0, samples: [] },
        evidence: { queryTimings: [], slowQueryWarningMs: 5000 },
        actionPolicy: {
          readOnlyReport: true,
          startsCrawler: false,
          contactsRemote: false,
          writesLocalDb: false,
          changesCollectBehavior: false,
        },
      },
      monitoredSmallCrawlSummary: {
        readinessLabel: 'no-new-data',
        dataCompletenessLabel: 'no-recent-downloads',
        cadenceStatus: 'no-recent-data',
        downloads: 0,
        success: 0,
        failed: 0,
        sampleCount: 0,
        latestSampleAt: null,
        latestDownloadAt: null,
        queryTimingMaxMs: 0,
        slowQueryStepCount: 0,
        blockerCount: 0,
        warningCount: 0,
      },
      health: {
        remote: 'unavailable',
        remoteError: null,
        localWatermark: null,
        lastConfirmedAt: null,
        lastPrunedAt: null,
        lastPrunedDeleted: null,
        lastSyncDurationMs: null,
        syncLagMs: null,
        remoteContentRows: 0,
        remoteContentBytes: 0,
        remoteContentMb: 0,
        ledger: null
      }
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

// Top-level crash capture (2026-07-20). This server child had NO
// uncaughtException/unhandledRejection handler, so any uncaught error from a
// request handler (e.g. a synchronous better-sqlite3 SQLITE_BUSY thrown during
// concurrent frontier reconciliation) killed the process with its reason
// swallowed — the electron parent didn't forward the child's stderr and didn't
// restart it, so the port went dead silently. Now: log a greppable FATAL line
// with the full stack (the electron parent forwards this to electron-app.log),
// then exit so the parent's supervisor respawns us. Exiting is deliberate — a
// process past an uncaught exception may hold corrupt state; a clean respawn is
// safer than limping on. Guard against a double-log if both fire.
let fatalHandled = false;
const onFatal = (kind) => (err) => {
  if (fatalHandled) return;
  fatalHandled = true;
  const e = err instanceof Error ? err : new Error(String(err));
  console.error(`[server] FATAL ${kind}: ${e && e.stack ? e.stack : e}`);
  try { shutdown(); } catch (_) { /* ignore */ }
  // Flush stderr before exit — give the pipe a tick to drain to the parent.
  setTimeout(() => process.exit(1), 100);
};
process.on('uncaughtException', onFatal('uncaughtException'));
process.on('unhandledRejection', onFatal('unhandledRejection'));

module.exports = { app, SUB_APPS: SUB_APPS_FACTORY({}), mountDashboardModules };
