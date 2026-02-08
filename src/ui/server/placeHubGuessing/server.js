'use strict';

const express = require('express');
const path = require('path');
const fs = require('fs');

const jsgui = require('jsgui3-html');

const { resolveBetterSqliteHandle } = require('../utils/dashboardModule');

const { renderPageHtml } = require('../shared');

const {
  buildMatrixModel,
  getCellModel,
  upsertCellVerification,
  computeAgeLabel,
  getMappingOutcome,
  parseEvidenceJson,
  normalizePlaceKind,
  normalizePageKind,
  normalizeSearchQuery,
  clampInt,
  normalizeOutcome,
  selectHosts,
  selectCountriesByContinent,
  listContinents,
  extractPathPattern,
  getHubArticleMetrics,
  getRecentHubArticles,
  getPlaceNameVariants,
  generateUrlPatterns,
  getHostUrlPatterns,
  getHostAnalysisFreshness,
  getPlaceById,
  getUncheckedHostsForPlace,
  getMappingsForPlace,
  getSitePatterns,
  generateCandidateHubUrls,
  // Host page count queries for 500-page threshold
  getHostPageCounts,
  getHostsAboveThreshold,
  getHostsBelowThreshold,
  getHostPageCount,
  getHostPageCountMap
} = require('../../../data/db/sqlite/v1/queries/placeHubGuessingUiQueries');

const { guessPlaceHubsBatch } = require('../../../core/orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../../../core/orchestration/dependencies');

// Crawl operations and pattern learning
const CrawlOperations = require('../../../core/crawler/CrawlOperations');
const { UrlPatternLearningService } = require('../../../services/UrlPatternLearningService');

const { PlaceHubGuessingMatrixControl, PlaceHubGuessingCellControl } = require('./controls');
const { createHubGuessingJobStore } = require('../hubGuessing/utils/hubGuessingJobs');
const { parseBoolean, parseNumber } = require('../hubGuessing/utils/guessingRequestUtils');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');
const STATUS_DIR = path.join(process.cwd(), 'tmp', 'status');
const JOBS_FILE = path.join(process.cwd(), 'tmp', 'place-hub-jobs.json');
const STATUS_FILE = path.join(STATUS_DIR, 'place-hub-guessing.json');

const { jobs, loadJobs, saveJobs, writeStatus, clearStatus } = createHubGuessingJobStore({
  jobsFile: JOBS_FILE,
  statusFile: STATUS_FILE
});

loadJobs();

// ==========================================
// SSE (Server-Sent Events) for real-time matrix updates
// ==========================================

/**
 * Connected SSE clients
 * @type {Set<import('http').ServerResponse>}
 */
const sseClients = new Set();

/**
 * Event log for recent events (limited size)
 * @type {Array<Object>}
 */
const eventLog = [];
const MAX_EVENT_LOG = 100;

/**
 * Broadcast an event to all connected SSE clients
 * @param {string} type - Event type
 * @param {Object} data - Event data
 */
function broadcastEvent(type, data = {}) {
  const event = {
    type,
    timestamp: new Date().toISOString(),
    ...data
  };

  // Add to log
  eventLog.push(event);
  if (eventLog.length > MAX_EVENT_LOG) {
    eventLog.shift();
  }

  // Broadcast to all clients
  const payload = `data: ${JSON.stringify(event)}\n\n`;
  for (const client of sseClients) {
    try {
      client.write(payload);
    } catch (e) {
      // Client disconnected, will be cleaned up on 'close'
    }
  }

  return event;
}

// ==========================================

function normalizeMatrixMode(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'table' || v === 'virtual') return v;
  return 'auto';
}

const VALID_STATE_FILTERS = new Set([
  'all',
  'unchecked',
  'guessed',
  'pending',
  'verified',
  'verified-present',
  'verified-absent',
  'needs-check'
]);

function normalizeStateFilter(value) {
  const v = String(value || '').toLowerCase().trim();
  if (VALID_STATE_FILTERS.has(v)) return v;
  return 'all';
}

function renderErrorHtml(message, title = 'Error') {
  const ctx = new jsgui.Page_Context();
  const pre = new jsgui.Control({ context: ctx, tagName: 'pre' });
  pre.add(new jsgui.String_Control({ context: ctx, text: String(message || '') }));
  return renderPageHtml(pre, { title });
}

function renderPlaceHubGuessingMatrixHtml(options = {}) {
  const { dbHandle } = options;
  if (!dbHandle) {
    throw new Error('renderPlaceHubGuessingMatrixHtml requires dbHandle');
  }

  const model = buildMatrixModel(dbHandle, options);
  model.activePattern = options.activePattern;
  model.parentPlace = options.parentPlace;
  model.continent = options.continent;
  model.matrixMode = options.matrixMode;
  model.matrixThreshold = options.matrixThreshold;
  const ctx = new jsgui.Page_Context();

  const control = new PlaceHubGuessingMatrixControl({
    context: ctx,
    basePath: options.basePath || '',
    model,
    computeAgeLabel,
    getMappingOutcome,
    matrixMode: normalizeMatrixMode(options.matrixMode),
    matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
  });

  return renderPageHtml(control, {
    title: '🧭 Place Hub Guessing — Coverage Matrix'
  });
}

function renderPlaceHubGuessingCellHtml({
  basePath = '',
  modelContext,
  place,
  mapping,
  host,
  articleMetrics,
  recentArticles,
  placeNameVariants = [],
  urlPatterns = [],
  hostPatterns = [],
  analysisFreshness = null,
  hostEligibility = null
}) {
  const placeLabel = place?.place_name || place?.country_code || String(place?.place_id || '');
  const outcome = mapping ? getMappingOutcome(mapping) : null;

  const mappingJson = mapping
    ? JSON.stringify(
      {
        ...mapping,
        evidence: parseEvidenceJson(mapping.evidence)
      },
      null,
      2
    )
    : '';

  const backParams = new URLSearchParams();
  backParams.set('kind', modelContext.placeKind);
  backParams.set('pageKind', modelContext.pageKind);
  backParams.set('placeLimit', String(modelContext.placeLimit));
  backParams.set('hostLimit', String(modelContext.hostLimit));
  if (modelContext.placeQ) backParams.set('q', modelContext.placeQ);
  if (modelContext.hostQ) backParams.set('hostQ', modelContext.hostQ);

  const backHref = `${basePath || '.'}/?${backParams.toString()}`;

  const cellState = mapping
    ? (mapping.status === 'verified' || mapping.verified_at
      ? (outcome === 'absent' ? 'Verified (not there)' : 'Verified (there)')
      : 'Pending')
    : 'Unchecked';

  const currentUrl = mapping?.url || '';
  const verifiedLabel = mapping?.verified_at
    ? `${mapping.verified_at} (${computeAgeLabel(mapping.verified_at)})`
    : '';

  const ctx = new jsgui.Page_Context();
  const control = new PlaceHubGuessingCellControl({
    context: ctx,
    basePath,
    model: {
      backHref,
      placeLabel,
      host,
      pageKind: modelContext.pageKind,
      cellState,
      currentUrl: currentUrl || '(none)',
      verifiedLabel,
      mappingJson,
      modelContext,
      articleMetrics: articleMetrics || null,
      recentArticles: recentArticles || [],
      placeNameVariants: placeNameVariants || [],
      urlPatterns: urlPatterns || [],
      hostPatterns: hostPatterns || [],
      analysisFreshness: analysisFreshness || null,
      hostEligibility: hostEligibility || null,
      place,
      mapping,
      hidden: {
        placeId: place?.place_id || '',
        host,
        kind: modelContext.placeKind,
        pageKind: modelContext.pageKind,
        placeLimit: modelContext.placeLimit,
        hostLimit: modelContext.hostLimit,
        q: modelContext.placeQ || '',
        hostQ: modelContext.hostQ || ''
      }
    }
  });

  return renderPageHtml(control, {
    title: '🧭 Place Hub Guessing — Cell'
  });
}

async function createPlaceHubGuessingRouter(options = {}) {
  const {
    dbPath = DB_PATH,
    getDbHandle,
    getDbRW,
    includeRootRoute = true
  } = options;

  const resolved = resolveBetterSqliteHandle({
    dbPath,
    readonly: true,
    getDbHandle,
    getDbRW
  });

  if (!resolved.dbHandle) {
    throw new Error('createPlaceHubGuessingRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const router = express.Router();

  // Needed for simple HTML form submissions.
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  // ==========================================
  // Cell details route
  // ==========================================
  router.get('/cell', (req, res) => {
    try {
      const placeId = parseInt(req.query.placeId, 10);
      const host = req.query.host;
      if (!placeId || !host) {
        return res.status(400).send('Missing placeId or host');
      }

      const placeKind = normalizePlaceKind(req.query.kind || 'country');
      const pageKind = normalizePageKind(req.query.pageKind || 'country-hub');
      // Ensure numerical inputs are actually numbers before clamping
      const placeLimit = clampInt(Number(req.query.placeLimit), { min: 1, max: 1000, fallback: 200 });
      const hostLimit = clampInt(Number(req.query.hostLimit), { min: 1, max: 200, fallback: 20 });
      const placeQ = normalizeSearchQuery(req.query.q);
      const hostQ = normalizeSearchQuery(req.query.hostQ);

      const place = getPlaceById(resolved.dbHandle, placeId);
      if (!place) {
        return res.status(404).send('Place not found');
      }

      // Re-fetch mapping to ensure fresh data
      const mapping = resolved.dbHandle.prepare(`
        SELECT * FROM place_page_mappings 
        WHERE place_id = ? AND host = ? AND page_kind = ?
      `).get(placeId, host, pageKind);

      const html = renderPlaceHubGuessingCellHtml({
        basePath: req.baseUrl,
        modelContext: {
          placeKind,
          pageKind,
          placeLimit,
          hostLimit,
          placeQ,
          hostQ
        },
        place,
        mapping,
        host
      });

      res.send(html);
    } catch (err) {
      console.error(err);
      res.status(500).send(renderErrorHtml(err.message));
    }
  });

  // ==========================================
  // SSE endpoint for real-time matrix updates
  // ==========================================
  router.get('/events', (req, res) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });

    // Send initial connection event
    res.write(`data: ${JSON.stringify({ type: 'connected', timestamp: new Date().toISOString() })}\n\n`);

    // Send recent events (last 10)
    for (const event of eventLog.slice(-10)) {
      res.write(`data: ${JSON.stringify(event)}\n\n`);
    }

    sseClients.add(res);
    broadcastEvent('sse:client-count', { clientCount: sseClients.size });

    req.on('close', () => {
      sseClients.delete(res);
      broadcastEvent('sse:client-count', { clientCount: sseClients.size });
    });
  });

  router.post('/api/guess', async (req, res) => {
    try {
      let { domains, apply = false, activePattern, parentPlace } = req.body;

      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        const pageKind = normalizePageKind(req.body.pageKind);
        const hostLimit = clampInt(req.body.hostLimit, { min: 1, max: 50, fallback: 12 });
        const hostQ = normalizeSearchQuery(req.body.hostQ);

        // Fetch a few more to allow for filtering
        const rawHosts = selectHosts(resolved.dbHandle, { pageKind, hostLimit: hostLimit * 5 });
        const filtered = hostQ
          ? rawHosts.filter((h) => String(h).toLowerCase().includes(hostQ.toLowerCase()))
          : rawHosts;

        domains = filtered.slice(0, hostLimit);
      }

      if (!domains || domains.length === 0) {
        return res.status(400).json({ error: 'domains array is required or no hosts matched filters' });
      }

      // Concurrency check: prevent multiple running jobs
      const activeJob = Array.from(jobs.values()).find(j => j.status === 'running' || j.status === 'pending');
      if (activeJob) {
        return res.status(409).json({ error: 'A job is already running', jobId: activeJob.id });
      }

      const distributed = parseBoolean(req.body?.distributed, parseBoolean(process.env.PLACE_HUB_GUESSING_DISTRIBUTED, true));
      const workerUrl = String(req.body?.workerUrl || process.env.PLACE_HUB_GUESSING_WORKER_URL || '').trim() || undefined;
      const batchSize = clampInt(
        parseNumber(req.body?.batchSize || process.env.PLACE_HUB_GUESSING_BATCH_SIZE, 50),
        { min: 1, max: 500, fallback: 50 }
      );
      const concurrency = clampInt(
        parseNumber(req.body?.concurrency || process.env.PLACE_HUB_GUESSING_CONCURRENCY, 10),
        { min: 1, max: 100, fallback: 10 }
      );

      const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        domains,
        activePattern,
        parentPlace,
        domainCount: domains.length,
        processedCount: 0,
        startTime: new Date().toISOString(),
        logs: [],
        distributed: {
          enabled: distributed,
          workerUrl: workerUrl || null,
          batchSize,
          concurrency
        },
        _controller: abortController // Private controller, not serialized
      });
      saveJobs();

      // Start background process
      (async () => {
        const job = jobs.get(jobId);
        job.status = 'running';
        job.logs.push({
          level: 'info',
          msg: distributed
            ? `Distributed mode enabled${workerUrl ? ` (${workerUrl})` : ''} [batchSize=${batchSize}, concurrency=${concurrency}]`
            : 'Distributed mode disabled',
          time: new Date()
        });
        writeStatus(jobId, 'running', {
          domains: job.domains,
          startTime: job.startTime,
          processedCount: 0,
          totalCount: job.domainCount
        });
        saveJobs();

        // Broadcast job start event
        broadcastEvent('job:started', {
          jobId,
          domains: job.domains,
          domainCount: job.domainCount,
          distributed,
          activePattern: job.activePattern
        });

        try {
          const deps = createPlaceHubDependencies({
            dbPath,
            verbose: true,
            distributed,
            workerUrl,
            distributedOptions: {
              batchSize,
              concurrency
            }
          });

          // Capture logs
          const originalLogger = deps.logger;
          deps.logger = {
            info: (msg) => {
              job.logs.push({ level: 'info', msg, time: new Date() });
              originalLogger.info(msg);

              if (msg && msg.includes('Batch processing domain')) {
                job.processedCount++;
                // Update status file for tray monitor
                writeStatus(jobId, 'running', {
                  domains: job.domains,
                  startTime: job.startTime,
                  processedCount: job.processedCount,
                  totalCount: job.domainCount
                });
                saveJobs();

                // Broadcast progress event
                broadcastEvent('job:progress', {
                  jobId,
                  processedCount: job.processedCount,
                  totalCount: job.domainCount,
                  message: msg
                });
              }
            },
            warn: (msg) => {
              job.logs.push({ level: 'warn', msg, time: new Date() });
              originalLogger.warn(msg);
            },
            error: (msg) => {
              job.logs.push({ level: 'error', msg, time: new Date() });
              originalLogger.error(msg);
            }
          };

          const domainBatch = domains.map((d) => ({
            domain: d,
            // If active pattern is present, override other options if needed, or just pass them through
          }));

          const batchOptions = {
            domainBatch,
            apply,
            runId: jobId,
            abortSignal: abortController.signal,
            activePattern: job.activePattern,
            parentPlace: job.parentPlace
          };

          if (activePattern) {
            // If active probe, we might want kind overrides (e.g. region, city)
            // The active probe processor defaults to region/city if parentPlace is set, or country otherwise.
            // But let's be explicit if we can.
            // The UI likely currently defaults to 'country' view, but for active probing we often want region/city.
            // We'll trust the processor's defaults or CLI logic for now. 
            // The ActiveProbeprocessor uses options.kinds.
            // We should probably allow options.kinds to be passed from UI, but for now we will hardcode to region,city if parentPlace is set
            if (parentPlace) {
              batchOptions.kinds = ['region', 'city'];
            }
          }

          const result = await guessPlaceHubsBatch(
            batchOptions,
            deps
          );

          if (result.aggregate && result.aggregate.batch && result.aggregate.batch.aborted) {
            throw new Error('Job cancelled by user');
          }

          job.status = 'completed';
          job.result = result;
          job.endTime = new Date().toISOString();
          clearStatus();
          saveJobs();

          // Broadcast job completion
          broadcastEvent('job:completed', {
            jobId,
            processedCount: job.processedCount,
            totalCount: job.domainCount,
            duration: Date.now() - new Date(job.startTime).getTime(),
            summary: result.aggregate?.summary || {}
          });
        } catch (err) {
          job.status = 'failed';
          job.error = err.message;
          job.endTime = new Date().toISOString();
          writeStatus(jobId, 'failed', { error: err.message });
          saveJobs();

          // Broadcast job failure
          broadcastEvent('job:failed', {
            jobId,
            error: err.message,
            processedCount: job.processedCount,
            totalCount: job.domainCount
          });

          // Keep failed status for a bit? Or clear it?
          // Let's clear it after a delay so the tray icon doesn't get stuck on "failed" forever if the user doesn't check it.
          setTimeout(clearStatus, 60000);
        }
      })();

      res.json({ jobId, status: 'pending', message: 'Job started', domains });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.get('/api/jobs', (req, res) => {
    try {
      // Return list of recent jobs, or at least the active one
      const jobsList = Array.from(jobs.values()).map(j => ({
        id: j.id,
        status: j.status,
        processedCount: j.processedCount,
        totalCount: j.domainCount,
        startTime: j.startTime,
        endTime: j.endTime,
        error: j.error,
        activePattern: j.activePattern,
        parentPlace: j.parentPlace
      }));

      // Sort by start time desc
      jobsList.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));

      res.json(jobsList);
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/api/jobs/:id/cancel', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });

    if (job.status === 'running' || job.status === 'pending') {
      if (job._controller) {
        job._controller.abort();
        job.status = 'failed';
        job.error = 'Cancelled by user';
        job.endTime = new Date().toISOString();
        saveJobs();
        clearStatus();
        return res.json({ message: 'Job cancellation requested' });
      }
    }

    res.status(400).json({ error: 'Job is not running' });
  });

  router.get('/api/jobs/:id', (req, res) => {
    const job = jobs.get(req.params.id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    res.json(job);
  });

  router.get('/api/jobs', (req, res) => {
    const list = Array.from(jobs.values())
      .sort((a, b) => new Date(b.startTime) - new Date(a.startTime))
      .map((j) => ({
        id: j.id,
        status: j.status,
        startTime: j.startTime,
        endTime: j.endTime,
        domains: j.domains,
        domainCount: j.domains ? j.domains.length : 0,
        processedCount: j.processedCount || 0,
        error: j.error,
        lastMessage: j.logs && j.logs.length > 0 ? j.logs[j.logs.length - 1].msg : null
      }));
    res.json(list);
  });

  // Hub probe API - check if a URL pattern exists
  router.post('/api/probe-hub', async (req, res) => {
    try {
      const { url } = req.body;
      if (!url || typeof url !== 'string') {
        return res.status(400).json({ error: 'url is required' });
      }

      // Validate URL format
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch {
        return res.status(400).json({ error: 'Invalid URL format' });
      }

      // Attempt to fetch the URL with a short timeout
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        const response = await fetch(url, {
          method: 'HEAD',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        clearTimeout(timeoutId);

        const result = {
          url,
          status: response.status,
          statusText: response.statusText,
          exists: response.ok,
          contentType: response.headers.get('content-type') || null,
          redirected: response.redirected,
          finalUrl: response.url
        };

        // If HEAD didn't work well (some servers don't support it), try GET
        if (response.status === 405) {
          const getResponse = await fetch(url, {
            method: 'GET',
            signal: controller.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          result.status = getResponse.status;
          result.statusText = getResponse.statusText;
          result.exists = getResponse.ok;
          result.contentType = getResponse.headers.get('content-type') || null;
          result.redirected = getResponse.redirected;
          result.finalUrl = getResponse.url;
        }

        res.json(result);
      } catch (fetchErr) {
        clearTimeout(timeoutId);
        if (fetchErr.name === 'AbortError') {
          return res.json({ url, exists: false, error: 'Timeout', status: 0 });
        }
        return res.json({ url, exists: false, error: fetchErr.message, status: 0 });
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== Hub Probe Queue System ==========
  // Provides batch probing of hub URLs with rate limiting and progress tracking

  const probeQueue = {
    items: [],       // { id, url, placeId, host, status, result, addedAt }
    processing: false,
    currentIndex: 0,
    results: [],
    rateLimitMs: 500  // 2 requests per second max
  };

  const PROBE_QUEUE_FILE = path.join(process.cwd(), 'tmp', 'probe-queue.json');

  // Load probe queue from disk on startup
  try {
    if (fs.existsSync(PROBE_QUEUE_FILE)) {
      const data = JSON.parse(fs.readFileSync(PROBE_QUEUE_FILE, 'utf8'));
      if (data && Array.isArray(data.items)) {
        probeQueue.items = data.items;
        probeQueue.results = data.results || [];
        probeQueue.currentIndex = data.currentIndex || 0;
      }
    }
  } catch (err) {
    console.error('Failed to load probe queue:', err.message);
  }

  function saveProbeQueue() {
    try {
      const toSave = {
        items: probeQueue.items.slice(-200),   // Keep last 200 items
        results: probeQueue.results.slice(-200),
        currentIndex: probeQueue.currentIndex,
        savedAt: new Date().toISOString()
      };
      fs.writeFileSync(PROBE_QUEUE_FILE, JSON.stringify(toSave, null, 2));
    } catch (err) {
      console.error('Failed to save probe queue:', err.message);
    }
  }

  async function probeUrl(url) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      let result = {
        url,
        status: response.status,
        statusText: response.statusText,
        exists: response.ok,
        contentType: response.headers.get('content-type') || null,
        redirected: response.redirected,
        finalUrl: response.url,
        probedAt: new Date().toISOString()
      };

      // Retry with GET if HEAD returns 405
      if (response.status === 405) {
        const getResponse = await fetch(url, {
          method: 'GET',
          signal: controller.signal,
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });
        result.status = getResponse.status;
        result.statusText = getResponse.statusText;
        result.exists = getResponse.ok;
        result.contentType = getResponse.headers.get('content-type') || null;
        result.redirected = getResponse.redirected;
        result.finalUrl = getResponse.url;
      }

      return result;
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return {
        url,
        exists: false,
        error: fetchErr.name === 'AbortError' ? 'Timeout' : fetchErr.message,
        status: 0,
        probedAt: new Date().toISOString()
      };
    }
  }

  async function processProbeQueue() {
    if (probeQueue.processing) return;
    probeQueue.processing = true;

    try {
      while (probeQueue.currentIndex < probeQueue.items.length) {
        const item = probeQueue.items[probeQueue.currentIndex];
        if (!item || item.status === 'done') {
          probeQueue.currentIndex++;
          continue;
        }

        item.status = 'probing';
        saveProbeQueue();

        const result = await probeUrl(item.url);

        // If primary URL fails, try fallbacks if available
        if (!result.exists && item.fallbackUrls && Array.isArray(item.fallbackUrls)) {
          console.log(`Primary probe failed for ${item.url}, trying ${item.fallbackUrls.length} fallbacks...`);
          for (const fallbackUrl of item.fallbackUrls) {
            // Rate limit fallbacks too
            await new Promise(resolve => setTimeout(resolve, probeQueue.rateLimitMs));

            const fallbackResult = await probeUrl(fallbackUrl);
            if (fallbackResult.exists) {
              console.log(`Fallback succeeded: ${fallbackUrl}`);
              // Adopt the successful fallback as the result
              result.exists = true;
              result.status = fallbackResult.status;
              result.statusText = fallbackResult.statusText;
              result.finalUrl = fallbackResult.finalUrl;
              result.url = fallbackUrl; // Update to the working URL
              item.url = fallbackUrl;   // Update item too
              break;
            }
          }
        }

        item.status = 'done';
        item.result = result;

        // Determine verification outcome based on probe result
        const outcome = result.exists ? 'present' : 'absent';
        item.result.outcome = outcome;


        // Save to database if we have placeId and host
        if (item.placeId && item.host && resolved.dbHandle) {
          try {
            const verifyResult = upsertCellVerification(resolved.dbHandle, {
              placeId: item.placeId,
              host: item.host,
              pageKind: item.pageKind || 'country-hub',
              outcome,
              url: item.url,
              note: `Auto-verified by probe: HTTP ${result.status}${result.error ? ` (${result.error})` : ''}`
            });
            item.result.dbSaved = !verifyResult.error;
            item.result.dbError = verifyResult.error?.message || null;

            if (!verifyResult.error) {
              broadcastEvent('cell:verified', {
                placeId: item.placeId,
                host: item.host,
                status: 'verified',
                outcome,
                verifiedAt: new Date().toISOString()
              });
            }
          } catch (dbErr) {
            console.error('Failed to save probe result to DB:', dbErr.message);
            item.result.dbSaved = false;
            item.result.dbError = dbErr.message;
          }
        }

        probeQueue.results.push({
          id: item.id,
          placeId: item.placeId,
          host: item.host,
          url: item.url,
          ...result
        });

        probeQueue.currentIndex++;
        saveProbeQueue();

        // Rate limit: wait before next request
        if (probeQueue.currentIndex < probeQueue.items.length) {
          await new Promise(resolve => setTimeout(resolve, probeQueue.rateLimitMs));
        }
      }
    } finally {
      probeQueue.processing = false;
    }
  }

  // Add URLs to probe queue
  router.post('/api/probe-queue/add', (req, res) => {
    try {
      const { urls } = req.body;

      if (!urls || !Array.isArray(urls) || urls.length === 0) {
        return res.status(400).json({ error: 'urls array is required' });
      }

      const added = [];
      for (const item of urls) {
        if (!item.url || typeof item.url !== 'string') continue;

        // Validate URL format
        try {
          new URL(item.url);
        } catch {
          continue; // Skip invalid URLs
        }

        const queueItem = {
          id: `probe-${Date.now()}-${Math.random().toString(36).substr(2, 6)}`,
          url: item.url,
          placeId: item.placeId || null,
          host: item.host || null,
          pageKind: item.pageKind || null,
          status: 'pending',
          result: null,
          addedAt: new Date().toISOString()
        };

        // If we have place context, generate fallbacks
        if (item.placeId && item.host && resolved.dbHandle) {
          try {
            const place = getPlaceById(resolved.dbHandle, item.placeId);
            if (place) {
              const candidates = generateCandidateHubUrlsWrapper(
                place.place_name,
                item.host,
                resolved.dbHandle,
                { maxUrls: 5 }
              );

              // Filter out the primary URL if it's in the list
              const fallbackUrls = candidates.filter(u => u !== item.url);
              if (fallbackUrls.length > 0) {
                queueItem.fallbackUrls = fallbackUrls;
              }
            }
          } catch (err) {
            console.error('Failed to generate fallbacks during queue add:', err.message);
          }
        }

        probeQueue.items.push(queueItem);
        added.push(queueItem.id);
      }

      saveProbeQueue();

      // Start processing if not already running
      if (!probeQueue.processing && added.length > 0) {
        processProbeQueue().catch(err => console.error('Probe queue error:', err.message));
      }

      res.json({
        added: added.length,
        queueLength: probeQueue.items.length,
        processing: probeQueue.processing,
        currentIndex: probeQueue.currentIndex
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get probe queue status
  router.get('/api/probe-queue/status', (req, res) => {
    const pending = probeQueue.items.filter(i => i.status === 'pending').length;
    const done = probeQueue.items.filter(i => i.status === 'done').length;
    const probing = probeQueue.items.filter(i => i.status === 'probing').length;

    // DB save stats
    const savedToDb = probeQueue.results.filter(r => r.dbSaved).length;
    const failedToSave = probeQueue.results.filter(r => r.dbSaved === false).length;
    const existsCount = probeQueue.results.filter(r => r.exists).length;
    const absentCount = probeQueue.results.filter(r => r.exists === false).length;

    res.json({
      queueLength: probeQueue.items.length,
      pending,
      done,
      probing,
      processing: probeQueue.processing,
      currentIndex: probeQueue.currentIndex,
      stats: {
        exists: existsCount,
        absent: absentCount,
        savedToDb,
        failedToSave,
        total: probeQueue.results.length
      },
      results: probeQueue.results.slice(-20)  // Last 20 results
    });
  });

  // Get probe queue results
  router.get('/api/probe-queue/results', (req, res) => {
    const limit = clampInt(req.query.limit, { min: 1, max: 500, fallback: 50 });
    const existsOnly = req.query.existsOnly === 'true';

    let results = probeQueue.results;
    if (existsOnly) {
      results = results.filter(r => r.exists);
    }

    res.json({
      total: probeQueue.results.length,
      returned: Math.min(results.length, limit),
      results: results.slice(-limit)
    });
  });

  // Clear probe queue
  router.post('/api/probe-queue/clear', (req, res) => {
    const keepResults = req.body.keepResults !== false;

    probeQueue.items = [];
    probeQueue.currentIndex = 0;
    if (!keepResults) {
      probeQueue.results = [];
    }

    saveProbeQueue();

    res.json({ cleared: true, resultsKept: keepResults });
  });

  // Apply probe results to database (for results that weren't saved automatically)
  router.post('/api/probe-queue/apply-to-db', (req, res) => {
    if (!resolved.dbHandle) {
      return res.status(500).json({ error: 'No database handle available' });
    }

    const { resultIds } = req.body;
    const targetResults = resultIds
      ? probeQueue.results.filter(r => resultIds.includes(r.id))
      : probeQueue.results.filter(r => r.placeId && r.host && !r.dbSaved);

    let applied = 0;
    let failed = 0;
    const errors = [];

    for (const result of targetResults) {
      if (!result.placeId || !result.host) {
        continue;
      }

      try {
        const outcome = result.exists ? 'present' : 'absent';
        const verifyResult = upsertCellVerification(resolved.dbHandle, {
          placeId: result.placeId,
          host: result.host,
          pageKind: result.pageKind || 'country-hub',
          outcome,
          url: result.url,
          note: `Applied from probe queue: HTTP ${result.status}${result.error ? ` (${result.error})` : ''}`
        });

        if (verifyResult.error) {
          failed++;
          errors.push({ id: result.id, error: verifyResult.error.message });
        } else {
          applied++;
          // Update the result to mark it as saved
          result.dbSaved = true;
          result.dbError = null;
        }
      } catch (err) {
        failed++;
        errors.push({ id: result.id, error: err.message });
      }
    }

    saveProbeQueue();

    res.json({
      applied,
      failed,
      total: targetResults.length,
      errors: errors.slice(0, 10)  // First 10 errors for debugging
    });
  });

  // ========== Place Scan API ==========
  // Scan all unchecked hosts for a specific place

  const placeScanState = {
    activeScan: null  // { placeId, placeName, hosts, currentIndex, processing, startedAt, results }
  };

  // ========== Host Crawl/Analysis State ==========
  // Track active crawl jobs and their progress
  const hostCrawlState = {
    activeCrawls: new Map(),  // host -> { crawler, startedAt, target, progress }
    crawlOperations: null     // Lazy-loaded CrawlOperations instance
  };

  // Threshold for requiring more crawl data
  const CRAWL_THRESHOLD = 500;
  const CRAWL_TARGET = 600;

  /**
   * Get or create the CrawlOperations instance
   */
  function getCrawlOperations() {
    if (!hostCrawlState.crawlOperations) {
      hostCrawlState.crawlOperations = new CrawlOperations({
        defaults: {
          enableDb: true,
          preferCache: true
        },
        logger: console
      });
    }
    return hostCrawlState.crawlOperations;
  }

  /**
   * Run pattern learning/analysis for a host
   * @param {object} dbHandle - Database handle
   * @param {string} host - Host domain
   * @returns {object} Pattern learning results
   */
  function runPatternAnalysis(dbHandle, host) {
    try {
      const learner = new UrlPatternLearningService({ db: dbHandle });
      const result = learner.learnPatternsFromDomain(host);
      broadcastEvent('analysis:completed', { host, result });
      return result;
    } catch (err) {
      broadcastEvent('analysis:error', { host, error: err.message });
      return { error: err.message };
    }
  }

  /**
   * Start a crawl for a host up to the target page count
   * @param {object} options
   * @param {string} options.host - Host domain
   * @param {number} options.currentPageCount - Current number of downloaded pages
   * @param {number} options.target - Target page count (default 600)
   * @returns {Promise<object>} Crawl result
   */
  async function startHostCrawl({ host, currentPageCount, target = CRAWL_TARGET }) {
    if (hostCrawlState.activeCrawls.has(host)) {
      return { error: 'Crawl already in progress for this host' };
    }

    const pagesToCrawl = Math.max(0, target - (currentPageCount || 0));
    if (pagesToCrawl <= 0) {
      return { message: 'Host already has sufficient pages', pageCount: currentPageCount };
    }

    const startUrl = `https://www.${host.replace(/^www\./, '')}`;
    const crawlOps = getCrawlOperations();

    const crawlState = {
      host,
      startedAt: new Date().toISOString(),
      target,
      currentPageCount,
      pagesToCrawl,
      status: 'running',
      crawler: null,
      pagesDownloaded: 0
    };

    hostCrawlState.activeCrawls.set(host, crawlState);

    broadcastEvent('crawl:started', {
      host,
      startUrl,
      target: pagesToCrawl,
      currentPageCount
    });

    try {
      const result = await crawlOps.runCustom(startUrl, {
        maxDownloads: pagesToCrawl,
        maxDepth: 3,
        crawlType: 'basic',
        enableDb: true,
        preferCache: true,
        useSitemap: true
      });

      crawlState.status = 'completed';
      crawlState.pagesDownloaded = result?.stats?.pagesDownloaded || pagesToCrawl;

      broadcastEvent('crawl:completed', {
        host,
        pagesDownloaded: crawlState.pagesDownloaded,
        duration: Date.now() - new Date(crawlState.startedAt).getTime()
      });

      return {
        success: true,
        host,
        pagesDownloaded: crawlState.pagesDownloaded,
        result
      };
    } catch (err) {
      crawlState.status = 'error';
      crawlState.error = err.message;

      broadcastEvent('crawl:error', {
        host,
        error: err.message
      });

      return { error: err.message };
    } finally {
      hostCrawlState.activeCrawls.delete(host);
    }
  }

  /**
   * Full pipeline: crawl (if needed) -> analyze -> ready for hub guessing
   * @param {object} options
   * @param {object} options.dbHandle - Database handle (read-only)
   * @param {string} options.dbPath - Path to database for write operations
   * @param {string} options.host - Host domain
   * @returns {Promise<object>} Pipeline result
   */
  async function runHostPreparationPipeline({ dbHandle, dbPath, host }) {
    // Check current page count
    const pageStats = getHostPageCount(dbHandle, host);

    const result = {
      host,
      initialPageCount: pageStats.page_count,
      wasEligible: pageStats.is_eligible,
      crawlResult: null,
      analysisResult: null
    };

    // Step 1: Crawl if needed
    if (pageStats.page_count < CRAWL_THRESHOLD) {
      broadcastEvent('pipeline:crawling', { host, currentPages: pageStats.page_count, target: CRAWL_TARGET });
      result.crawlResult = await startHostCrawl({
        host,
        currentPageCount: pageStats.page_count,
        target: CRAWL_TARGET
      });

      if (result.crawlResult.error) {
        return result;
      }
    }

    // Step 2: Run pattern analysis
    // Get fresh handle after crawl
    const freshResolved = resolveBetterSqliteHandle({ dbPath, readonly: false });
    try {
      broadcastEvent('pipeline:analyzing', { host });
      result.analysisResult = runPatternAnalysis(freshResolved.dbHandle, host);
    } finally {
      try { freshResolved.close(); } catch { /* ignore */ }
    }

    broadcastEvent('pipeline:ready', { host, result });
    return result;
  }

  /**
   * Probe a single URL and return result
   */
  async function probeSingleUrl(url, timeoutMs = 10000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
      });
      clearTimeout(timeoutId);

      let result = {
        url,
        status: response.status,
        statusText: response.statusText,
        exists: response.ok,
        contentType: response.headers.get('content-type') || null,
        redirected: response.redirected,
        finalUrl: response.url,
        probedAt: new Date().toISOString()
      };

      // Retry with GET if HEAD returns 405
      if (response.status === 405) {
        const getController = new AbortController();
        const getTimeoutId = setTimeout(() => getController.abort(), timeoutMs);
        try {
          const getResponse = await fetch(url, {
            method: 'GET',
            signal: getController.signal,
            headers: {
              'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
          });
          clearTimeout(getTimeoutId);
          result.status = getResponse.status;
          result.statusText = getResponse.statusText;
          result.exists = getResponse.ok;
          result.contentType = getResponse.headers.get('content-type') || null;
          result.redirected = getResponse.redirected;
          result.finalUrl = getResponse.url;
        } catch (getErr) {
          clearTimeout(getTimeoutId);
          // Keep HEAD result
        }
      }

      return result;
    } catch (fetchErr) {
      clearTimeout(timeoutId);
      return {
        url,
        exists: false,
        error: fetchErr.name === 'AbortError' ? 'Timeout' : fetchErr.message,
        status: 0,
        probedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Generate a candidate hub URL for a place + host combination.
   * Uses site-specific patterns from site_url_patterns table when available.
   * 
   * @param {string} placeName - Place name to slugify
   * @param {string} host - Host domain
   * @param {object} [dbHandle] - Optional database handle for pattern lookup
   * @returns {string|null} Primary candidate URL
   */
  function generateCandidateHubUrl(placeName, host, dbHandle = null) {
    if (!placeName || !host) return null;

    // If we have a DB handle, use pattern-aware generation
    if (dbHandle) {
      const candidateUrls = generateCandidateHubUrls(dbHandle, host, placeName, { maxUrls: 1 });
      if (candidateUrls.length > 0) {
        return candidateUrls[0];
      }
    }

    // Fallback to legacy slugification
    const slug = String(placeName)
      .toLowerCase()
      .replace(/[^\w\s-]/g, '')  // Remove special chars
      .replace(/\s+/g, '-')       // Spaces to dashes
      .replace(/-+/g, '-')        // Multiple dashes to single
      .replace(/^-|-$/g, '');     // Trim dashes

    // Try common patterns - start with /world/ as it's most common for news sites
    const patterns = [
      `/world/${slug}`,
      `/${slug}`,
      `/news/${slug}`,
      `/topics/${slug}`,
      `/location/${slug}`
    ];

    // Return the first pattern as primary, others as potential fallbacks (handled by caller via generateCandidateHubUrlsWrapper)
    const normalizedHost = host.startsWith('www.') ? host : host;
    return `https://${normalizedHost}${patterns[0]}`;
  }

  /**
   * Generate multiple candidate hub URLs for a place + host combination.
   * Uses site-specific patterns from site_url_patterns table when available.
   * 
   * @param {string} placeName - Place name to slugify
   * @param {string} host - Host domain
   * @param {object} dbHandle - Database handle for pattern lookup
   * @param {object} [options] - Options
   * @param {number} [options.maxUrls=5] - Maximum URLs to generate
   * @returns {Array<string>} Array of candidate URLs
   */
  function generateCandidateHubUrlsWrapper(placeName, host, dbHandle, options = {}) {
    if (!placeName || !host || !dbHandle) return [];
    return generateCandidateHubUrls(dbHandle, host, placeName, options);
  }

  /**
   * Scan a place across all unchecked hosts
   * @param {object} dbHandle - Read-only database handle
   * @param {string} dbPath - Path to database for write operations
   * @param {number} placeId - Place ID to scan
   * @param {string} placeName - Place name for URL generation
   * @param {string} pageKind - Page kind (default 'country-hub')
   * @param {object} options - Additional options
   * @param {boolean} options.autoCrawl - If true, crawl hosts with < 500 pages before probing
   * @param {boolean} options.autoAnalyze - If true, run pattern analysis after crawling
   */
  async function runPlaceScan(dbHandle, dbPath, placeId, placeName, pageKind = 'country-hub', options = {}) {
    const { autoCrawl = false, autoAnalyze = false } = options;

    if (placeScanState.activeScan) {
      throw new Error('A scan is already in progress');
    }

    // Get unchecked hosts
    const uncheckedHosts = getUncheckedHostsForPlace(dbHandle, { placeId, pageKind, hostLimit: 100 });

    if (uncheckedHosts.length === 0) {
      return { message: 'All hosts already checked for this place', hostsScanned: 0 };
    }

    // If autoCrawl is enabled, pre-check which hosts need crawling
    let hostsToCrawl = [];
    if (autoCrawl) {
      const hostPageStats = getHostPageCountMap(dbHandle, uncheckedHosts, CRAWL_THRESHOLD);
      for (const host of uncheckedHosts) {
        const stats = hostPageStats.get(host.replace(/^www\./, ''));
        if (!stats || !stats.is_eligible) {
          hostsToCrawl.push({
            host,
            pageCount: stats?.page_count || 0,
            pagesNeeded: CRAWL_THRESHOLD - (stats?.page_count || 0)
          });
        }
      }
    }

    // Initialize scan state
    placeScanState.activeScan = {
      placeId,
      placeName,
      pageKind,
      hosts: uncheckedHosts,
      totalHosts: uncheckedHosts.length,
      currentIndex: 0,
      currentHost: null,
      phase: autoCrawl ? 'preparing' : 'probing',
      processing: true,
      startedAt: new Date().toISOString(),
      results: [],
      found: 0,
      notFound: 0,
      autoCrawl,
      autoAnalyze,
      hostsToCrawl: hostsToCrawl.length,
      hostsCrawled: 0,
      hostsAnalyzed: 0
    };

    // Broadcast scan start
    broadcastEvent('scan:started', {
      placeId,
      placeName,
      totalHosts: uncheckedHosts.length,
      hosts: uncheckedHosts,
      autoCrawl,
      hostsToCrawl: hostsToCrawl.length
    });

    // Get a writable DB handle for saving results
    const rwResolved = resolveBetterSqliteHandle({
      dbPath,
      readonly: false
    });

    const rateLimitMs = 500; // 2 requests per second

    try {
      for (let i = 0; i < uncheckedHosts.length; i++) {
        if (!placeScanState.activeScan?.processing) {
          // Scan was cancelled
          break;
        }

        const host = uncheckedHosts[i];
        placeScanState.activeScan.currentIndex = i;
        placeScanState.activeScan.currentHost = host;

        // Check if this host needs crawling first (when autoCrawl is enabled)
        if (autoCrawl) {
          const pageStats = getHostPageCount(rwResolved.dbHandle, host);

          if (pageStats.page_count < CRAWL_THRESHOLD) {
            placeScanState.activeScan.phase = 'preparing';

            // Broadcast that we're crawling this host
            broadcastEvent('scan:host-crawling', {
              placeId,
              host,
              currentPages: pageStats.page_count,
              target: CRAWL_TARGET,
              index: i + 1,
              total: uncheckedHosts.length
            });

            // Start crawl and wait for it to complete
            try {
              const crawlResult = await startHostCrawl({
                host,
                currentPageCount: pageStats.page_count,
                target: CRAWL_TARGET
              });

              placeScanState.activeScan.hostsCrawled++;

              // Run pattern analysis if enabled
              if (autoAnalyze && !crawlResult.error) {
                broadcastEvent('scan:host-analyzing', {
                  placeId,
                  host,
                  index: i + 1,
                  total: uncheckedHosts.length
                });

                runPatternAnalysis(rwResolved.dbHandle, host);
                placeScanState.activeScan.hostsAnalyzed++;
              }
            } catch (crawlErr) {
              broadcastEvent('scan:host-crawl-error', {
                placeId,
                host,
                error: crawlErr.message
              });
              // Continue with probing anyway - might still work
            }
          }
        }

        // Switch to probing phase
        placeScanState.activeScan.phase = 'probing';

        // Generate candidate URL for this place + host (uses site-specific patterns if available)
        const candidateUrl = generateCandidateHubUrl(placeName, host, rwResolved.dbHandle);
        if (!candidateUrl) {
          continue;
        }

        // Probe the URL
        const probeResult = await probeSingleUrl(candidateUrl);
        const outcome = probeResult.exists ? 'present' : 'absent';

        // Save to database
        let dbSaved = false;
        let dbError = null;
        try {
          const upsertResult = upsertCellVerification(rwResolved.dbHandle, {
            placeId,
            host,
            pageKind,
            outcome,
            url: candidateUrl,
            note: `Auto-scanned: HTTP ${probeResult.status}${probeResult.error ? ` (${probeResult.error})` : ''}`
          });
          dbSaved = !upsertResult.error;
          dbError = upsertResult.error?.message || null;
        } catch (err) {
          dbSaved = false;
          dbError = err.message;
        }

        // Track results
        const resultEntry = {
          host,
          url: candidateUrl,
          exists: probeResult.exists,
          status: probeResult.status,
          outcome,
          dbSaved,
          dbError
        };
        placeScanState.activeScan.results.push(resultEntry);

        if (probeResult.exists) {
          placeScanState.activeScan.found++;
        } else {
          placeScanState.activeScan.notFound++;
        }

        // Broadcast cell update event for real-time UI updates
        broadcastEvent('scan:cell-update', {
          placeId,
          host,
          pageKind,
          outcome,
          state: outcome === 'present' ? 'verified-present' : 'verified-absent',
          url: candidateUrl,
          status: probeResult.status,
          index: i + 1,
          total: uncheckedHosts.length,
          found: placeScanState.activeScan.found,
          notFound: placeScanState.activeScan.notFound
        });

        // Rate limit
        if (i < uncheckedHosts.length - 1) {
          await new Promise(resolve => setTimeout(resolve, rateLimitMs));
        }
      }

      // Scan complete
      const scanResult = {
        placeId,
        placeName,
        totalHosts: uncheckedHosts.length,
        scanned: placeScanState.activeScan.results.length,
        found: placeScanState.activeScan.found,
        notFound: placeScanState.activeScan.notFound,
        duration: Date.now() - new Date(placeScanState.activeScan.startedAt).getTime()
      };

      broadcastEvent('scan:completed', scanResult);

      return scanResult;
    } finally {
      placeScanState.activeScan = null;
      try {
        rwResolved.close();
      } catch {
        // ignore
      }
    }
  }

  // Cancel active scan (must be before :placeId route)
  router.post('/api/scan-place/cancel', (req, res) => {
    if (!placeScanState.activeScan) {
      return res.json({ cancelled: false, message: 'No active scan' });
    }

    placeScanState.activeScan.processing = false;
    res.json({ cancelled: true, message: 'Scan cancellation requested' });
  });

  // Start scanning a place across all unchecked hosts
  router.post('/api/scan-place/:placeId', async (req, res) => {
    try {
      const placeId = Number(req.params.placeId);
      const pageKind = normalizePageKind(req.body.pageKind);
      const autoCrawl = parseBoolean(req.body.autoCrawl, false);
      const autoAnalyze = parseBoolean(req.body.autoAnalyze, autoCrawl); // Default to same as autoCrawl

      if (!Number.isFinite(placeId) || placeId <= 0) {
        return res.status(400).json({ error: 'Invalid placeId' });
      }

      // Check for active scan
      if (placeScanState.activeScan) {
        return res.status(409).json({
          error: 'A scan is already in progress',
          activeScan: {
            placeId: placeScanState.activeScan.placeId,
            placeName: placeScanState.activeScan.placeName,
            progress: `${placeScanState.activeScan.currentIndex + 1}/${placeScanState.activeScan.totalHosts}`
          }
        });
      }

      // Get place info
      const place = getPlaceById(resolved.dbHandle, placeId);
      if (!place) {
        return res.status(404).json({ error: 'Place not found' });
      }

      const placeName = place.place_name || `Place #${placeId}`;

      // Check how many hosts need scanning
      const uncheckedHosts = getUncheckedHostsForPlace(resolved.dbHandle, { placeId, pageKind, hostLimit: 100 });

      if (uncheckedHosts.length === 0) {
        return res.json({
          message: 'All hosts already checked for this place',
          placeId,
          placeName,
          hostsToScan: 0
        });
      }

      // If autoCrawl is enabled, check which hosts need crawling
      let hostsToCrawl = [];
      if (autoCrawl) {
        const hostPageStats = getHostPageCountMap(resolved.dbHandle, uncheckedHosts, CRAWL_THRESHOLD);
        for (const host of uncheckedHosts) {
          const stats = hostPageStats.get(host.replace(/^www\./, ''));
          if (!stats || !stats.is_eligible) {
            hostsToCrawl.push(host);
          }
        }
      }

      // Respond immediately, run scan in background
      res.json({
        message: 'Scan started',
        placeId,
        placeName,
        hostsToScan: uncheckedHosts.length,
        hosts: uncheckedHosts,
        autoCrawl,
        autoAnalyze,
        hostsToCrawl: hostsToCrawl.length,
        note: autoCrawl && hostsToCrawl.length > 0
          ? `${hostsToCrawl.length} hosts will be crawled first (need 500+ pages for pattern analysis)`
          : undefined
      });

      // Run scan in background with options
      runPlaceScan(resolved.dbHandle, dbPath, placeId, placeName, pageKind, { autoCrawl, autoAnalyze })
        .catch(err => {
          console.error('Place scan error:', err.message);
          broadcastEvent('scan:error', {
            placeId,
            placeName,
            error: err.message
          });
        });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get current scan status
  router.get('/api/scan-place/status', (req, res) => {
    if (!placeScanState.activeScan) {
      return res.json({ active: false });
    }

    const scan = placeScanState.activeScan;
    res.json({
      active: true,
      placeId: scan.placeId,
      placeName: scan.placeName,
      totalHosts: scan.totalHosts,
      currentIndex: scan.currentIndex,
      found: scan.found,
      notFound: scan.notFound,
      startedAt: scan.startedAt,
      // Auto-crawl progress
      autoCrawl: scan.autoCrawl || false,
      autoAnalyze: scan.autoAnalyze || false,
      hostsCrawled: scan.hostsCrawled || 0,
      hostsAnalyzed: scan.hostsAnalyzed || 0,
      currentHost: scan.currentHost || null,
      phase: scan.phase || 'probing' // 'preparing' (crawl/analyze) or 'probing' (checking URLs)
    });
  });

  // ========== Host Management API Endpoints ==========
  // Get and prepare hosts for place hub guessing

  /**
   * Get all hosts with their page counts and eligibility status
   * Hosts with < 500 pages need crawling before pattern analysis
   */
  router.get('/api/hosts/status', (req, res) => {
    try {
      const threshold = clampInt(req.query.threshold, { min: 1, max: 10000, fallback: CRAWL_THRESHOLD });
      const limit = clampInt(req.query.limit, { min: 1, max: 500, fallback: 100 });

      const allHosts = getHostPageCounts(resolved.dbHandle);

      // Categorize hosts
      const eligible = [];
      const needsCrawling = [];

      for (const host of allHosts.slice(0, limit)) {
        if (host.page_count >= threshold) {
          eligible.push({
            ...host,
            is_eligible: true
          });
        } else {
          needsCrawling.push({
            ...host,
            is_eligible: false,
            pages_needed: threshold - host.page_count
          });
        }
      }

      res.json({
        threshold,
        totalHosts: allHosts.length,
        eligible: {
          count: eligible.length,
          hosts: eligible
        },
        needsCrawling: {
          count: needsCrawling.length,
          hosts: needsCrawling
        },
        activeCrawls: Array.from(hostCrawlState.activeCrawls.keys())
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get status for a single host
   */
  router.get('/api/hosts/:host/status', (req, res) => {
    try {
      const host = req.params.host;
      const pageStats = getHostPageCount(resolved.dbHandle, host);
      const activeCrawl = hostCrawlState.activeCrawls.get(host);

      res.json({
        host,
        page_count: pageStats.page_count,
        successful_pages: pageStats.successful_pages,
        is_eligible: pageStats.is_eligible,
        pages_needed: pageStats.is_eligible ? 0 : (CRAWL_THRESHOLD - pageStats.page_count),
        crawlInProgress: !!activeCrawl,
        crawlStatus: activeCrawl ? {
          startedAt: activeCrawl.startedAt,
          target: activeCrawl.pagesToCrawl,
          status: activeCrawl.status
        } : null
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Start a crawl for a host to reach the 600-page target
   * POST body: { target?: number }
   */
  router.post('/api/hosts/:host/crawl', async (req, res) => {
    try {
      const host = req.params.host;
      const target = clampInt(req.body.target, { min: 100, max: 5000, fallback: CRAWL_TARGET });

      // Check current page count
      const pageStats = getHostPageCount(resolved.dbHandle, host);

      if (pageStats.page_count >= target) {
        return res.json({
          message: 'Host already has sufficient pages',
          host,
          page_count: pageStats.page_count,
          target
        });
      }

      // Check for active crawl
      if (hostCrawlState.activeCrawls.has(host)) {
        return res.status(409).json({
          error: 'Crawl already in progress for this host',
          activeCrawl: hostCrawlState.activeCrawls.get(host)
        });
      }

      // Respond immediately
      res.json({
        message: 'Crawl started',
        host,
        currentPages: pageStats.page_count,
        target,
        pagesToCrawl: target - pageStats.page_count
      });

      // Start crawl in background
      startHostCrawl({
        host,
        currentPageCount: pageStats.page_count,
        target
      }).catch(err => {
        console.error(`Host crawl error for ${host}:`, err.message);
        broadcastEvent('crawl:error', { host, error: err.message });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Get active crawl status for all hosts
   */
  router.get('/api/hosts/crawls/active', (req, res) => {
    try {
      const activeCrawls = [];
      for (const [host, state] of hostCrawlState.activeCrawls) {
        activeCrawls.push({
          host,
          startedAt: state.startedAt,
          target: state.pagesToCrawl,
          currentPageCount: state.currentPageCount,
          status: state.status
        });
      }

      res.json({
        count: activeCrawls.length,
        crawls: activeCrawls
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Run pattern analysis for a host
   * POST body: { }
   */
  router.post('/api/hosts/:host/analyze', async (req, res) => {
    try {
      const host = req.params.host;

      // Check if host has enough pages
      const pageStats = getHostPageCount(resolved.dbHandle, host);

      if (pageStats.page_count < CRAWL_THRESHOLD) {
        return res.status(400).json({
          error: 'Host needs more crawled pages before analysis',
          host,
          page_count: pageStats.page_count,
          threshold: CRAWL_THRESHOLD,
          pages_needed: CRAWL_THRESHOLD - pageStats.page_count
        });
      }

      // Get write handle for analysis
      const rwResolved = resolveBetterSqliteHandle({ dbPath, readonly: false });

      try {
        broadcastEvent('analysis:started', { host });
        const result = runPatternAnalysis(rwResolved.dbHandle, host);

        res.json({
          success: true,
          host,
          result
        });
      } finally {
        try { rwResolved.close(); } catch { /* ignore */ }
      }
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * Full pipeline: crawl (if needed) -> analyze -> ready for hub guessing
   * POST body: { target?: number }
   */
  router.post('/api/hosts/:host/prepare', async (req, res) => {
    try {
      const host = req.params.host;

      // Check current page count
      const pageStats = getHostPageCount(resolved.dbHandle, host);

      // Respond with initial status
      res.json({
        message: 'Preparation pipeline started',
        host,
        currentPages: pageStats.page_count,
        needsCrawl: pageStats.page_count < CRAWL_THRESHOLD,
        threshold: CRAWL_THRESHOLD
      });

      // Run pipeline in background
      runHostPreparationPipeline({
        dbHandle: resolved.dbHandle,
        dbPath,
        host
      }).catch(err => {
        console.error(`Pipeline error for ${host}:`, err.message);
        broadcastEvent('pipeline:error', { host, error: err.message });
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // ========== Continent API Endpoints ==========

  // List all continents with country counts
  router.get('/api/continents', (req, res) => {
    try {
      const continents = listContinents(resolved.dbHandle);
      res.json({
        continents,
        total: continents.reduce((sum, c) => sum + c.country_count, 0)
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get countries for a specific continent
  router.get('/api/continents/:continent/countries', (req, res) => {
    try {
      const continent = req.params.continent;
      const limit = clampInt(req.query.limit, { min: 1, max: 500, fallback: 200 });

      const countries = selectCountriesByContinent(resolved.dbHandle, {
        continent: continent === 'all' ? null : continent,
        limit
      });

      res.json({
        continent,
        countries,
        count: countries.length
      });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const placeKind = normalizePlaceKind(req.query.kind);
        const pageKind = normalizePageKind(req.query.pageKind);
        const placeLimit = clampInt(req.query.placeLimit, { min: 1, max: 500, fallback: 200 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 100, fallback: 30 });
        const placeQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);
        const stateFilter = normalizeStateFilter(req.query.stateFilter);
        const continent = req.query.continent || null;  // Continent filter for country-hub

        const matrixMode = normalizeMatrixMode(req.query.matrixMode);
        const matrixThreshold = clampInt(req.query.matrixThreshold, { min: 1, max: 10000000, fallback: 50000 });
        const activePattern = req.query.activePattern || '';
        const parentPlace = req.query.parentPlace || '';

        const html = renderPlaceHubGuessingMatrixHtml({
          dbHandle: resolved.dbHandle,
          placeKind,
          pageKind,
          placeLimit,
          hostLimit,
          placeQ,
          hostQ,
          stateFilter,
          continent,
          matrixMode,
          matrixThreshold,
          activePattern,
          parentPlace,
          basePath: req.baseUrl || ''
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.get('/cell', (req, res) => {
      try {
        const basePath = req.baseUrl || '';

        const result = getCellModel(resolved.dbHandle, {
          placeId: req.query.placeId,
          host: req.query.host,
          placeKind: req.query.kind,
          pageKind: req.query.pageKind,
          placeLimit: req.query.placeLimit,
          hostLimit: req.query.hostLimit,
          placeQ: req.query.q,
          hostQ: req.query.hostQ,
          stateFilter: req.query.stateFilter,
          continent: req.query.continent,
          parentPlace: req.query.parentPlace,
          activePattern: req.query.activePattern,
          matrixMode: req.query.matrixMode,
          matrixThreshold: req.query.matrixThreshold
        });

        if (result?.error) {
          res.status(result.error.status).type('html').send(renderErrorHtml(result.error.message));
          return;
        }

        // Compute article metrics if mapping has a URL
        let articleMetrics = null;
        let recentArticles = [];
        if (result.mapping?.url) {
          const urlPattern = extractPathPattern(result.mapping.url);
          if (urlPattern) {
            articleMetrics = getHubArticleMetrics(resolved.dbHandle, {
              host: result.host,
              urlPattern
            });
            recentArticles = getRecentHubArticles(resolved.dbHandle, {
              host: result.host,
              urlPattern,
              limit: 10
            });
          }
        }

        // Get place name variants from gazetteer database
        let placeNameVariants = [];
        try {
          const gazetteerPath = path.join(process.cwd(), 'data', 'gazetteer.db');
          if (fs.existsSync(gazetteerPath)) {
            const Database = require('better-sqlite3');
            const gazDb = new Database(gazetteerPath, { readonly: true });
            placeNameVariants = getPlaceNameVariants(gazDb, result.place?.place_id);
            gazDb.close();
          }
        } catch (gazErr) {
          console.error('Failed to get place name variants:', gazErr.message);
        }

        // Generate URL patterns based on place name
        const urlPatterns = generateUrlPatterns(result.place?.place_name, result.host);

        // Get host URL patterns from existing URLs
        const hostPatterns = getHostUrlPatterns(resolved.dbHandle, result.host);

        // Get analysis freshness for this host
        const analysisFreshness = getHostAnalysisFreshness(resolved.dbHandle, result.host);

        // Get host eligibility for crawl button
        const hostPageStats = getHostPageCount(resolved.dbHandle, result.host);
        const hostEligibility = {
          host: result.host,
          pageCount: hostPageStats.page_count,
          isEligible: hostPageStats.is_eligible,
          threshold: CRAWL_THRESHOLD,
          target: CRAWL_TARGET,
          pagesNeeded: hostPageStats.is_eligible ? 0 : Math.max(0, CRAWL_THRESHOLD - hostPageStats.page_count)
        };

        const html = renderPlaceHubGuessingCellHtml({
          basePath,
          modelContext: result.modelContext,
          place: result.place,
          mapping: result.mapping,
          host: result.host,
          articleMetrics,
          recentArticles,
          placeNameVariants,
          urlPatterns,
          hostPatterns,
          analysisFreshness,
          hostEligibility
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.post('/cell/verify', (req, res) => {
      try {
        const placeId = Number(req.body.placeId);
        const host = String(req.body.host || '').trim();
        const url = String(req.body.url || '').trim();
        const outcome = normalizeOutcome(req.body.outcome);
        const note = normalizeSearchQuery(req.body.note);

        const placeKind = normalizePlaceKind(req.body.kind);
        const pageKind = normalizePageKind(req.body.pageKind);
        const placeLimit = clampInt(req.body.placeLimit, { min: 1, max: 500, fallback: 200 });
        const hostLimit = clampInt(req.body.hostLimit, { min: 1, max: 100, fallback: 30 });
        const placeQ = normalizeSearchQuery(req.body.q);
        const hostQ = normalizeSearchQuery(req.body.hostQ);
        const stateFilter = normalizeStateFilter(req.body.stateFilter);
        const continent = req.body.continent || '';
        const parentPlace = req.body.parentPlace || '';
        const activePattern = req.body.activePattern || '';
        const matrixMode = normalizeMatrixMode(req.body.matrixMode);
        const matrixThreshold = clampInt(req.body.matrixThreshold, { min: 1, max: 10000000, fallback: 50000 });

        if (!url) {
          res.status(400).type('html').send(renderErrorHtml('URL is required'));
          return;
        }
        if (!outcome) {
          res.status(400).type('html').send(renderErrorHtml('Invalid outcome'));
          return;
        }

        const rw = resolveBetterSqliteHandle({
          dbPath,
          readonly: false,
          getDbHandle,
          getDbRW
        });

        try {
          const upsertResult = upsertCellVerification(rw.dbHandle, {
            placeId,
            host,
            pageKind,
            outcome,
            url,
            note
          });

          if (upsertResult?.error) {
            res.status(upsertResult.error.status).type('html').send(renderErrorHtml(upsertResult.error.message));
            return;
          }

          // Broadcast cell verification event for real-time matrix updates
          broadcastEvent('cell:verified', {
            placeId,
            host,
            pageKind,
            outcome,
            url,
            mappingId: upsertResult?.id || null
          });
        } finally {
          try {
            rw.close();
          } catch {
            // ignore
          }
        }

        const params = new URLSearchParams();
        params.set('placeId', String(placeId));
        params.set('host', host);
        params.set('kind', placeKind);
        params.set('pageKind', pageKind);
        params.set('placeLimit', String(placeLimit));
        params.set('hostLimit', String(hostLimit));
        if (placeQ) params.set('q', placeQ);
        if (hostQ) params.set('hostQ', hostQ);
        if (stateFilter) params.set('stateFilter', stateFilter);
        if (continent) params.set('continent', continent);
        if (parentPlace) params.set('parentPlace', parentPlace);
        if (activePattern) params.set('activePattern', activePattern);
        if (matrixMode) params.set('matrixMode', matrixMode);
        if (matrixThreshold) params.set('matrixThreshold', String(matrixThreshold));
        params.set('updated', '1');

        res.redirect(`${req.baseUrl || ''}/cell?${params.toString()}`);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
        return;
      }
    });
  }

  return { router, close: resolved.close };
}

module.exports = {
  createPlaceHubGuessingRouter,
  renderPlaceHubGuessingMatrixHtml,
  // SSE utilities for external integration
  broadcastEvent,
  sseClients
};
