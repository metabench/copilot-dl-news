'use strict';

const crypto = require('crypto');
const { observable } = require('fnl');

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
    historyLimit = 200
  } = {}) {
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
    return Array.from(this._jobs.values()).map((job) => ({
      id: job.id,
      mode: 'in-process',
      operationName: job.operationName,
      startUrl: job.startUrl,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      paused: Boolean(job.paused),
      abortRequested: Boolean(job.abortRequested)
    }));
  }

  get(jobId) {
    const job = this._jobs.get(jobId);
    if (!job) return null;
    return {
      id: job.id,
      mode: 'in-process',
      operationName: job.operationName,
      startUrl: job.startUrl,
      status: job.status,
      createdAt: job.createdAt,
      startedAt: job.startedAt,
      finishedAt: job.finishedAt,
      paused: Boolean(job.paused),
      abortRequested: Boolean(job.abortRequested)
    };
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

    let crawlerRef = null;

    const wrappedTelemetry = this._telemetry
      ? {
          connectCrawler: (crawler, meta) => {
            crawlerRef = crawler;
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
          job.finishedAt = new Date().toISOString();
          next({ type: 'job:result', jobId, result });
          complete({ jobId, result });
        })
        .catch((err) => {
          job.status = 'failed';
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
}

module.exports = {
  InProcessCrawlJobRegistry
};
