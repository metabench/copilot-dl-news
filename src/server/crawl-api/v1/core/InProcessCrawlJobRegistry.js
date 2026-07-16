'use strict';

const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const { fork } = require('child_process');
const { EventEmitter } = require('events');
const { observable } = require('fnl');

// Per-job worker logs land here (repo-root/data/logs/jobs/<jobId>.log).
// Why: worker stdio used to be 'inherit', so when LeMonde failed with 5,146
// errors (2026-07-15, job 143fc616) every error detail vanished with the
// server console — nothing in `errors`/`crawl_problems` either. See
// docs/sessions/2026-07-14-recursive-crawl-loop/LOOP_STATE.md.
const JOB_LOG_DIR = path.resolve(__dirname, '..', '..', '..', '..', '..', 'data', 'logs', 'jobs');

function classifyErrorMessage(message) {
  const text = String(message || 'unknown');
  // Prefer a recognizable code: ECONNRESET, ETIMEDOUT, HTTP 403, 429…
  const m = text.match(/\b(E[A-Z]{4,}|ERR_[A-Z_]+|HTTP[ _]?\d{3}|status \d{3}|\b[45]\d{2}\b)/);
  return m ? m[1] : text.slice(0, 80);
}

function createJobId() {
  try {
    if (typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
  } catch (_) {}
  return `job-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`;
}

function normalizeString(value) {
  if (value === undefined || value === null) return null;
  const text = String(value).trim();
  return text ? text : null;
}

function normalizeOverrides(value) {
  if (!value) return {};
  if (typeof value === 'object' && !Array.isArray(value)) return value;
  return {};
}

class InProcessCrawlJobRegistry {
  constructor({
    createCrawlService,
    serviceOptions,
    telemetryIntegration,
    allowMultiJobs = false,
    historyLimit = 200,
    // Worker mode runs each operation in a forked child so crawls cannot
    // starve this server's event loop (in-process jobs stalled the API
    // 15-20s+ under load — 2026-07-07). Default from UI_CRAWL_WORKER=1.
    workerMode = process.env.UI_CRAWL_WORKER === '1'
  } = {}) {
    this._workerMode = Boolean(workerMode);
    this._createCrawlService = typeof createCrawlService === 'function' ? createCrawlService : null;
    this._serviceOptions = serviceOptions && typeof serviceOptions === 'object' ? serviceOptions : {};
    this._defaultOverrides = this._serviceOptions.defaultOverrides && typeof this._serviceOptions.defaultOverrides === 'object'
      ? this._serviceOptions.defaultOverrides
      : {};

    const telemetry = telemetryIntegration || this._serviceOptions.telemetryIntegration;
    this._telemetry = telemetry && typeof telemetry.connectCrawler === 'function' ? telemetry : null;

    this._allowMultiJobs = Boolean(allowMultiJobs);
    this._historyLimit = Number.isFinite(historyLimit) ? Math.max(0, Math.trunc(historyLimit)) : 200;

    /** @type {Map<string, any>} */
    this._jobs = new Map();

    // Minimal observable for job list changes.
    this._events = observable(() => {});
  }

  _emit(event) {
    try {
      this._events.raise('next', event);
    } catch (_) {}
  }

  getObservable() {
    return this._events;
  }

  list() {
    return Array.from(this._jobs.values()).map((job) => this._toPublicJob(job));
  }

  get(jobId) {
    const job = this._jobs.get(jobId);
    if (!job) return null;
    return this._toPublicJob(job);
  }

  _toPublicJob(job) {
    return {
      id: job.id,
      mode: job.mode || 'in-process',
      operationName: job.operationName,
      startUrl: job.startUrl,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      paused: Boolean(job.paused),
      abortRequested: Boolean(job.abortRequested),
      error: job.error || null,
      // Live numeric progress for the crawl status page (jobs table +
      // throughput strip), incl. the Electron unified app. Populated by
      // _attachJobProgress; null until the first progress event or in
      // worker mode. See core/jobProgress.js.
      progress: job.progress || null,
      // Post-mortem material: first-N url:error samples + counts by kind
      // (see _attachErrorSummary), and the worker's captured stdio log.
      errorSummary: job.errorSummary || null,
      logPath: job.logPath || null
    };
  }

  /**
   * Keep a bounded, queryable record of url:error events on the job so a
   * failed crawl can be diagnosed after the fact (LeMonde 2026-07-15 burned
   * 5,146 errors with zero persisted detail). Never throws; never grows
   * unbounded: counts are per-kind, samples cap at 25.
   */
  _attachErrorSummary(job, crawler) {
    if (!job || !crawler || typeof crawler.on !== 'function') return;
    if (job._errorSummaryAttached) return;
    job._errorSummaryAttached = true;
    try {
      crawler.on('url:error', (data) => {
        try {
          const summary = job.errorSummary || (job.errorSummary = { total: 0, byKind: {}, samples: [] });
          summary.total += 1;
          const kind = classifyErrorMessage(data && data.error);
          summary.byKind[kind] = (summary.byKind[kind] || 0) + 1;
          if (summary.samples.length < 25) {
            summary.samples.push({
              url: (data && data.url) || null,
              error: String((data && data.error) || 'unknown').slice(0, 300),
              at: new Date(data && data.timestamp || Date.now()).toISOString()
            });
          }
        } catch (_) { /* diagnostics must not affect the crawl */ }
      });
    } catch (_) { /* best-effort */ }
  }

  /**
   * Subscribe to a crawler's in-process progress events and keep a
   * normalized snapshot on the job record so /api/v1/crawl/jobs carries
   * live numbers. Never throws; display must not affect the crawl.
   */
  _attachJobProgress(job, crawler) {
    if (!job || !crawler || typeof crawler.on !== 'function') return;
    if (job._progressAttached) return;
    job._progressAttached = true;
    try {
      const { createJobProgressTracker } = require('./jobProgress');
      const tracker = createJobProgressTracker();
      crawler.on('progress', (payload) => {
        try {
          job.progress = tracker.record(payload);
        } catch (_) { /* ignore */ }
      });
    } catch (_) { /* progress display is best-effort */ }
  }

  _getInternal(jobId) {
    return this._jobs.get(jobId) || null;
  }

  pause(jobId) {
    const job = this._getInternal(jobId);
    if (!job) return false;
    if (typeof job.pause === 'function') {
      try { job.pause(); } catch (_) {}
    }
    job.paused = true;
    this._emit({ type: 'job:paused', jobId });
    return true;
  }

  resume(jobId) {
    const job = this._getInternal(jobId);
    if (!job) return false;
    if (typeof job.resume === 'function') {
      try { job.resume(); } catch (_) {}
    }
    job.paused = false;
    this._emit({ type: 'job:resumed', jobId });
    return true;
  }

  stop(jobId) {
    const job = this._getInternal(jobId);
    if (!job) return false;
    if (typeof job.stop === 'function') {
      try { job.stop(); } catch (_) {}
    }
    job.abortRequested = true;
    this._emit({ type: 'job:stop-requested', jobId });
    return true;
  }

  startOperation({ logger, operationName, startUrl, overrides } = {}) {
    if (!this._createCrawlService) {
      throw new Error('InProcessCrawlJobRegistry requires createCrawlService to start jobs.');
    }

    const op = normalizeString(operationName);
    const url = normalizeString(startUrl);
    if (!op) throw new Error('operationName is required.');
    if (!url) throw new Error('startUrl is required.');

    if (!this._allowMultiJobs) {
      const hasRunning = Array.from(this._jobs.values()).some((job) => job.status === 'running');
      if (hasRunning) {
        const err = new Error('Another in-process crawl job is already running.');
        err.statusCode = 409;
        err.code = 'JOB_CONFLICT';
        throw err;
      }
    }

    const jobId = createJobId();
    const nowIso = new Date().toISOString();

    const job = {
      id: jobId,
      operationName: op,
      startUrl: url,
      mode: 'in-process',
      status: 'running',
      createdAt: nowIso,
      startedAt: nowIso,
      finishedAt: null,
      paused: false,
      abortRequested: false,
      stop: null,
      pause: null,
      resume: null,
      observable: null,
      promise: null
    };

    if (this._workerMode) {
      return this._startOperationInWorker(job, { operationName: op, startUrl: url, overrides });
    }

    let crawlerRef = null;

    const wrappedTelemetry = this._telemetry
      ? {
          connectCrawler: (crawler, meta) => {
            crawlerRef = crawler;
            this._attachJobProgress(job, crawler);
            this._attachErrorSummary(job, crawler);
            try {
              return this._telemetry.connectCrawler(crawler, {
                ...(meta && typeof meta === 'object' ? meta : {}),
                jobId,
                crawlType: 'operation'
              });
            } catch (_) {
              return null;
            }
          }
        }
      : null;

    const service = this._createCrawlService({
      ...this._serviceOptions,
      telemetryIntegration: wrappedTelemetry || this._serviceOptions.telemetryIntegration
    });

    const mergedOverrides = {
      ...this._defaultOverrides,
      ...normalizeOverrides(overrides),
      jobId,
      crawlType: 'operation'
    };

    const run$ = observable((next, complete, error) => {
      job.stop = () => {
        job.abortRequested = true;
        if (crawlerRef && typeof crawlerRef.stopAsync === 'function') {
          crawlerRef.stopAsync({ timeoutMs: 8000, reason: 'stop' }).catch(() => {});
          return;
        }
        if (crawlerRef && typeof crawlerRef.requestAbort === 'function') {
          crawlerRef.requestAbort('stop');
        }
      };

      job.pause = () => {
        job.paused = true;
        if (crawlerRef && typeof crawlerRef.pause === 'function') {
          crawlerRef.pause();
        }
      };

      job.resume = () => {
        job.paused = false;
        if (crawlerRef && typeof crawlerRef.resume === 'function') {
          crawlerRef.resume();
        }
      };

      Promise.resolve()
        .then(() => service.runOperation({
          logger: logger || console,
          operationName: op,
          startUrl: url,
          overrides: mergedOverrides
        }))
        .then((result) => {
          job.status = result && result.status === 'ok' ? 'completed' : 'failed';
          if (job.status === 'failed') {
            const reason = result && (result.error || result.message);
            job.error = typeof reason === 'string'
              ? reason
              : (reason && reason.message) || (reason ? JSON.stringify(reason).slice(0, 500) : 'operation returned non-ok status');
          }
          job.finishedAt = new Date().toISOString();
          next({ type: 'job:result', jobId, result });
          complete({ jobId, result });
        })
        .catch((err) => {
          job.status = 'failed';
          // Persist the reason on the record: previously it was only emitted as
          // a job:failed event and lost to API consumers (2026-07-07 crawl-ops c4).
          job.error = (err && err.message) || String(err);
          job.finishedAt = new Date().toISOString();
          error(err);
        });

      return [
        () => job.stop && job.stop(),
        () => job.pause && job.pause(),
        () => job.resume && job.resume()
      ];
    });

    job.observable = run$;
    this._jobs.set(jobId, job);
    this._emit({ type: 'job:started', jobId, job: this.get(jobId) });

    job.promise = new Promise((resolve, reject) => {
      run$.on('complete', (final) => {
        this._emit({ type: 'job:completed', jobId, final });
        resolve(final);
      });
      run$.on('error', (err) => {
        this._emit({ type: 'job:failed', jobId, error: err?.message || String(err) });
        reject(err);
      });
    });

    if (this._jobs.size > this._historyLimit) {
      const oldestKey = this._jobs.keys().next().value;
      if (oldestKey) {
        this._jobs.delete(oldestKey);
      }
    }

    return { jobId, job: this.get(jobId) };
  }

  /**
   * Worker mode: run the operation in a forked child. Crawler telemetry
   * events arrive over IPC and are replayed onto a local EventEmitter that is
   * connected to the real telemetry bridge — the UI sees identical progress.
   */
  _startOperationInWorker(job, { operationName, startUrl, overrides }) {
    const jobId = job.id;
    job.mode = 'worker';

    const mergedOverrides = {
      ...this._defaultOverrides,
      ...normalizeOverrides(overrides),
      jobId,
      crawlType: 'operation'
    };

    // Capture worker stdio to a per-job log file ('inherit' lost it with the
    // server console — undiagnosable LeMonde failure, 2026-07-15).
    const child = fork(path.join(__dirname, 'crawl-operation-worker.js'), [], {
      stdio: ['ignore', 'pipe', 'pipe', 'ipc'],
      env: { ...process.env }
    });

    let logStream = null;
    try {
      fs.mkdirSync(JOB_LOG_DIR, { recursive: true });
      const logFile = path.join(JOB_LOG_DIR, `${jobId}.log`);
      logStream = fs.createWriteStream(logFile, { flags: 'a' });
      logStream.write(`[job ${jobId}] ${operationName} ${startUrl} started ${new Date().toISOString()}\n`);
      job.logPath = path.relative(path.resolve(JOB_LOG_DIR, '..', '..', '..'), logFile).split(path.sep).join('/');
      if (child.stdout) child.stdout.pipe(logStream, { end: false });
      if (child.stderr) child.stderr.pipe(logStream, { end: false });
    } catch (_) { logStream = null; /* logging is best-effort */ }

    // Replay child crawler events into the real bridge via a stand-in emitter.
    const emitter = new EventEmitter();
    // Live job progress works in worker mode too: the replayed 'progress'
    // events feed the same per-job tracker as in-process crawls.
    this._attachJobProgress(job, emitter);
    // url:error events are forwarded over IPC as well — same bounded
    // summary as in-process jobs (kind counts + first-25 samples).
    this._attachErrorSummary(job, emitter);
    let disconnect = null;
    if (this._telemetry) {
      try {
        disconnect = this._telemetry.connectCrawler(emitter, { jobId, crawlType: 'operation' });
      } catch (_) { disconnect = null; }
    }

    let settled = false;
    const settle = (status, error) => {
      if (settled) return;
      settled = true;
      job.status = status;
      if (error) job.error = typeof error === 'string' ? error : (error.message || JSON.stringify(error).slice(0, 500));
      job.finishedAt = new Date().toISOString();
      try { if (disconnect) disconnect(); } catch (_) {}
      try {
        if (logStream) {
          const errLine = job.errorSummary ? ` errors=${job.errorSummary.total} kinds=${JSON.stringify(job.errorSummary.byKind)}` : '';
          logStream.write(`[job ${jobId}] finished status=${status}${job.error ? ` error=${job.error}` : ''}${errLine} ${job.finishedAt}\n`);
          logStream.end();
        }
      } catch (_) {}
      this._emit({ type: status === 'completed' ? 'job:completed' : 'job:failed', jobId, error: job.error || undefined });
    };

    child.on('message', (m) => {
      if (!m || typeof m !== 'object') return;
      if (m.type === 'crawler-event') {
        try { emitter.emit(m.event, m.data); } catch (_) {}
      } else if (m.type === 'result') {
        settle(m.status === 'ok' ? 'completed' : 'failed', m.error || null);
      } else if (m.type === 'fatal') {
        settle('failed', m.error || 'worker fatal error');
      }
    });

    child.on('exit', (code, signal) => {
      settle(code === 0 ? 'completed' : 'failed', code === 0 ? null : `worker exited code=${code} signal=${signal || 'none'}`);
    });
    child.on('error', (err) => settle('failed', err));

    job.stop = () => {
      job.abortRequested = true;
      try { child.send({ type: 'stop' }); } catch (_) {}
      // Escalate if the graceful stop stalls.
      setTimeout(() => { if (!settled) { try { child.kill(); } catch (_) {} } }, 30000);
    };

    job.promise = new Promise((resolve) => {
      const check = setInterval(() => {
        if (settled) { clearInterval(check); resolve({ jobId, status: job.status }); }
      }, 500);
      if (typeof check.unref === 'function') check.unref();
    });

    this._jobs.set(jobId, job);
    this._emit({ type: 'job:started', jobId, job: this.get(jobId) });

    if (this._jobs.size > this._historyLimit) {
      const oldestKey = this._jobs.keys().next().value;
      if (oldestKey) this._jobs.delete(oldestKey);
    }

    child.send({ type: 'run', operationName, startUrl, overrides: mergedOverrides });

    return { jobId, job: this.get(jobId) };
  }
}

module.exports = {
  InProcessCrawlJobRegistry
};
