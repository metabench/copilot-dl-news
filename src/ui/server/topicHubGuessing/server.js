'use strict';

const express = require('express');
const path = require('path');

const jsgui = require('jsgui3-html');

const { resolveBetterSqliteHandle } = require('../utils/serverStartupCheckdashboardModule');
const { renderPageHtml } = require('../shared');
const { createPlaceHubDependencies } = require('../../../core/orchestration/dependencies');
const { guessPlaceHubsBatch } = require('../../../core/orchestration/placeHubGuessing');
const { selectTopicSlugRows } = require('../../../data/db/sqlite/v1/queries/nonGeoTopicSlugsUiQueries');
const { createHubGuessingJobStore } = require('../hubGuessing/utils/hubGuessingJobs');
const { parseBoolean, parseNumber } = require('../hubGuessing/utils/guessingRequestUtils');

const {
  buildMatrixModel,
  selectCellRows,
  normalizeLang,
  normalizeSearchQuery,
  clampInt,
  selectTopicHubHosts
} = require('../../../data/db/sqlite/v1/queries/topicHubGuessingUiQueries');

const { TopicHubGuessingMatrixControl, TopicHubGuessingCellControl } = require('./controls');

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), 'data', 'news.db');
const STATUS_DIR = path.join(process.cwd(), 'tmp', 'status');
const JOBS_FILE = path.join(process.cwd(), 'tmp', 'topic-hub-jobs.json');
const STATUS_FILE = path.join(STATUS_DIR, 'topic-hub-guessing.json');

const { jobs, loadJobs, saveJobs, writeStatus, clearStatus } = createHubGuessingJobStore({
  jobsFile: JOBS_FILE,
  statusFile: STATUS_FILE
});

loadJobs();

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

function renderTopicHubGuessingMatrixHtml(options = {}) {
  const { dbHandle } = options;
  if (!dbHandle) {
    throw new Error('renderTopicHubGuessingMatrixHtml requires dbHandle');
  }

  const model = buildMatrixModel(dbHandle, options);
  const ctx = new jsgui.Page_Context();

  const control = new TopicHubGuessingMatrixControl({
    context: ctx,
    basePath: options.basePath || '',
    model: {
      ...model,
      matrixMode: normalizeMatrixMode(options.matrixMode),
      matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
    },
    matrixMode: normalizeMatrixMode(options.matrixMode),
    matrixThreshold: Number.isFinite(options.matrixThreshold) ? options.matrixThreshold : undefined
  });

  return renderPageHtml(control, {
    title: '🏷️ Topic Hub Guessing — Coverage Matrix'
  });
}

function renderTopicHubGuessingCellHtml({ basePath = '', modelContext, host, topicSlug, topicLabel, rows }) {
  const backParams = new URLSearchParams();
  if (modelContext.lang) backParams.set('lang', modelContext.lang);
  backParams.set('topicLimit', String(modelContext.topicLimit));
  backParams.set('hostLimit', String(modelContext.hostLimit));
  if (modelContext.topicQ) backParams.set('q', modelContext.topicQ);
  if (modelContext.hostQ) backParams.set('hostQ', modelContext.hostQ);

  const backHref = `${basePath || '.'}/?${backParams.toString()}`;

  const ctx = new jsgui.Page_Context();
  const control = new TopicHubGuessingCellControl({
    context: ctx,
    model: {
      backHref,
      host,
      topicSlug,
      topicLabel,
      rows
    }
  });

  return renderPageHtml(control, {
    title: '🏷️ Topic Hub Guessing — Cell'
  });
}

async function createTopicHubGuessingRouter(options = {}) {
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
    throw new Error('createTopicHubGuessingRouter requires a db handle (getDbHandle/getDbRW/dbPath)');
  }

  const router = express.Router();
  router.use(express.urlencoded({ extended: false }));
  router.use(express.json());

  router.post('/api/guess', async (req, res) => {
    try {
      let { domains, apply = false } = req.body;

      const lang = normalizeLang(req.body.lang, { fallback: 'und' });
      const topicLimit = clampInt(req.body.topicLimit, { min: 1, max: 2000, fallback: 120 });
      const hostLimit = clampInt(req.body.hostLimit, { min: 1, max: 400, fallback: 40 });
      const topicQ = normalizeSearchQuery(req.body.q);
      const hostQ = normalizeSearchQuery(req.body.hostQ);

      if (!domains || !Array.isArray(domains) || domains.length === 0) {
        const rawHosts = selectTopicHubHosts(resolved.dbHandle, { hostLimit: hostLimit * 5, hostQ });
        const filtered = hostQ
          ? rawHosts.filter((h) => String(h).toLowerCase().includes(hostQ.toLowerCase()))
          : rawHosts;
        domains = filtered.slice(0, hostLimit);
      }

      if (!domains || domains.length === 0) {
        return res.status(400).json({ error: 'domains array is required or no hosts matched filters' });
      }

      const activeJob = Array.from(jobs.values()).find((j) => j.status === 'running' || j.status === 'pending');
      if (activeJob) {
        return res.status(409).json({ error: 'A job is already running', jobId: activeJob.id });
      }

      const distributed = parseBoolean(req.body?.distributed, parseBoolean(process.env.TOPIC_HUB_GUESSING_DISTRIBUTED, true));
      const workerUrl = String(req.body?.workerUrl || process.env.TOPIC_HUB_GUESSING_WORKER_URL || '').trim() || undefined;
      const batchSize = clampInt(
        parseNumber(req.body?.batchSize || process.env.TOPIC_HUB_GUESSING_BATCH_SIZE, 50),
        { min: 1, max: 500, fallback: 50 }
      );
      const concurrency = clampInt(
        parseNumber(req.body?.concurrency || process.env.TOPIC_HUB_GUESSING_CONCURRENCY, 10),
        { min: 1, max: 100, fallback: 10 }
      );

      const jobId = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      const abortController = new AbortController();

      jobs.set(jobId, {
        id: jobId,
        status: 'pending',
        domains,
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
        _controller: abortController
      });
      saveJobs();

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

          const originalLogger = deps.logger;
          deps.logger = {
            info: (msg) => {
              job.logs.push({ level: 'info', msg, time: new Date() });
              originalLogger.info(msg);

              if (msg && msg.includes('Batch processing domain')) {
                job.processedCount++;
                writeStatus(jobId, 'running', {
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

          const topicRows = selectTopicSlugRows(resolved.dbHandle, {
            lang,
            q: topicQ,
            limit: topicLimit
          });
          const topics = topicRows.map((row) => row.slug).filter(Boolean);

          const domainBatch = domains.map((d) => ({ domain: d }));
          const batchOptions = {
            domainBatch,
            apply,
            runId: jobId,
            abortSignal: abortController.signal,
            enableTopicDiscovery: true,
            topics: topics.length ? topics : [],
            limit: topicLimit
          };

          const result = await guessPlaceHubsBatch(batchOptions, deps);

          if (result.aggregate && result.aggregate.batch && result.aggregate.batch.aborted) {
            throw new Error('Job cancelled by user');
          }

          job.status = 'completed';
          job.result = result;
          job.endTime = new Date().toISOString();
          clearStatus();
          saveJobs();
        } catch (err) {
          job.status = 'failed';
          job.error = err.message;
          job.endTime = new Date().toISOString();
          writeStatus(jobId, 'failed', { error: err.message });
          saveJobs();
          setTimeout(clearStatus, 60000);
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

  if (includeRootRoute) {
    router.get('/', (req, res) => {
      try {
        const lang = normalizeLang(req.query.lang, { fallback: 'und' });
        const topicLimit = clampInt(req.query.topicLimit, { min: 1, max: 2000, fallback: 120 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 400, fallback: 40 });
        const topicQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

        const matrixMode = normalizeMatrixMode(req.query.matrixMode);
        const matrixThreshold = clampInt(req.query.matrixThreshold, { min: 1, max: 10000000, fallback: 50000 });

        const html = renderTopicHubGuessingMatrixHtml({
          dbHandle: resolved.dbHandle,
          basePath: req.baseUrl || '',
          lang,
          topicLimit,
          hostLimit,
          q: topicQ,
          hostQ,
          matrixMode,
          matrixThreshold
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });

    router.get('/cell', (req, res) => {
      try {
        const basePath = req.baseUrl || '';
        const host = String(req.query.host || '').trim();
        const topicSlug = String(req.query.topicSlug || '').trim();
        const lang = normalizeLang(req.query.lang, { fallback: 'und' });

        const topicLimit = clampInt(req.query.topicLimit, { min: 1, max: 2000, fallback: 120 });
        const hostLimit = clampInt(req.query.hostLimit, { min: 1, max: 400, fallback: 40 });
        const topicQ = normalizeSearchQuery(req.query.q);
        const hostQ = normalizeSearchQuery(req.query.hostQ);

        if (!host || !topicSlug) {
          res.status(400).type('html').send(renderErrorHtml('host and topicSlug are required'));
          return;
        }

        const modelContext = { lang, topicLimit, hostLimit, topicQ, hostQ };

        const rows = selectCellRows(resolved.dbHandle, { topicSlug, host, limit: 200 });
        const topicLabel = (rows[0] && (rows[0].topic_label || rows[0].topic_slug)) || topicSlug;

        const html = renderTopicHubGuessingCellHtml({
          basePath,
          modelContext,
          host,
          topicSlug,
          topicLabel,
          rows
        });

        res.type('html').send(html);
      } catch (err) {
        res.status(500).type('html').send(renderErrorHtml(err.stack || err.message));
      }
    });
  }

  return { router, close: resolved.close };
}

module.exports = {
  createTopicHubGuessingRouter,
  renderTopicHubGuessingMatrixHtml
};
