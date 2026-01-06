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
  selectHosts
} = require('../../../db/sqlite/v1/queries/placeHubGuessingUiQueries');

const { guessPlaceHubsBatch } = require('../../../orchestration/placeHubGuessing');
const { createPlaceHubDependencies } = require('../../../orchestration/dependencies');

const { PlaceHubGuessingMatrixControl, PlaceHubGuessingCellControl } = require('./controls');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');
const STATUS_DIR = path.join(process.cwd(), 'tmp', 'status');
const JOBS_FILE = path.join(process.cwd(), 'tmp', 'place-hub-jobs.json');

const jobs = new Map();

// Load jobs from disk on startup
try {
  if (fs.existsSync(JOBS_FILE)) {
    const data = JSON.parse(fs.readFileSync(JOBS_FILE, 'utf8'));
    if (Array.isArray(data)) {
      for (const job of data) {
        // If server restarted, running jobs are now failed/interrupted
        if (job.status === 'running' || job.status === 'pending') {
          job.status = 'failed';
          job.error = 'Server restarted';
          job.endTime = new Date().toISOString();
        }
        jobs.set(job.id, job);
      }
    }
  }
} catch (err) {
  console.error('Failed to load jobs:', err);
}

function saveJobs() {
  try {
    const list = Array.from(jobs.values());
    // Keep last 50 jobs
    const sorted = list.sort((a, b) => new Date(b.startTime) - new Date(a.startTime));
    const toSave = sorted.slice(0, 50);
    
    // Prune memory
    if (sorted.length > 50) {
      const toRemove = sorted.slice(50);
      for (const job of toRemove) {
        jobs.delete(job.id);
      }
    }
    
    fs.writeFileSync(JOBS_FILE, JSON.stringify(toSave, null, 2));
  } catch (err) {
    console.error('Failed to save jobs:', err);
  }
}

function writeStatusFile(jobId, status, data = {}) {
  try {
    if (!fs.existsSync(STATUS_DIR)) {
      fs.mkdirSync(STATUS_DIR, { recursive: true });
    }
    const filePath = path.join(STATUS_DIR, 'place-hub-guessing.json');
    const content = {
      jobId,
      status,
      updatedAt: Date.now(),
      pid: process.pid,
      ...data
    };
    fs.writeFileSync(filePath, JSON.stringify(content, null, 2));
  } catch (err) {
    console.error('Failed to write status file:', err);
  }
}

function clearStatusFile() {
  try {
    const filePath = path.join(STATUS_DIR, 'place-hub-guessing.json');
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch (err) {
    console.error('Failed to clear status file:', err);
  }
}

function normalizeMatrixMode(value) {
  const v = String(value || '').toLowerCase().trim();
  if (v === 'table' || v === 'virtual') return v;
  return 'auto';
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

function renderPlaceHubGuessingCellHtml({ basePath = '', modelContext, place, mapping, host }) {
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
        _controller: abortController // Private controller, not serialized
      });
      saveJobs();

      // Start background process
      (async () => {
        const job = jobs.get(jobId);
        job.status = 'running';
        writeStatusFile(jobId, 'running', { 
          domains: job.domains, 
          startTime: job.startTime,
          processedCount: 0,
          totalCount: job.domainCount
        });
        saveJobs();

        try {
          const deps = createPlaceHubDependencies({
            dbPath,
            verbose: true
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
                writeStatusFile(jobId, 'running', { 
                  domains: job.domains, 
                  startTime: job.startTime,
                  processedCount: job.processedCount,
                  totalCount: job.domainCount
                });
                saveJobs();
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
          clearStatusFile();
          saveJobs();
        } catch (err) {
          job.status = 'failed';
          job.error = err.message;
          job.endTime = new Date().toISOString();
          writeStatusFile(jobId, 'failed', { error: err.message });
          saveJobs();
          // Keep failed status for a bit? Or clear it?
          // Let's clear it after a delay so the tray icon doesn't get stuck on "failed" forever if the user doesn't check it.
          setTimeout(clearStatusFile, 60000);
        }
      })();

      res.json({ jobId, status: 'pending', message: 'Job started', domains });
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
        clearStatusFile();
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

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const placeKind = normalizePlaceKind(req.query.kind);
        const pageKind = normalizePageKind(req.query.pageKind);
        const placeLimit = clampInt(req.query.placeLimit, { min: 1, max: 200, fallback: 30 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 50, fallback: 12 });
        const placeQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

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
          hostQ: req.query.hostQ
        });

        if (result?.error) {
          res.status(result.error.status).type('html').send(renderErrorHtml(result.error.message));
          return;
        }

        const html = renderPlaceHubGuessingCellHtml({
          basePath,
          modelContext: result.modelContext,
          place: result.place,
          mapping: result.mapping,
          host: result.host
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
        const placeLimit = clampInt(req.body.placeLimit, { min: 1, max: 200, fallback: 30 });
        const hostLimit = clampInt(req.body.hostLimit, { min: 1, max: 50, fallback: 12 });
        const placeQ = normalizeSearchQuery(req.body.q);
        const hostQ = normalizeSearchQuery(req.body.hostQ);

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
  renderPlaceHubGuessingMatrixHtml
};
