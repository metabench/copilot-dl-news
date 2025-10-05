'use strict';

const { GazetteerIngestionCoordinator, sanitizeSummary } = require('./GazetteerIngestionCoordinator');

class GazetteerModeController {
  constructor({
    telemetry,
    milestoneTracker = null,
    state = null,
    dbAdapter = null,
    logger = console,
    jobId = null,
    ingestionCoordinator = null
  } = {}) {
    if (!telemetry) {
      throw new Error('GazetteerModeController requires telemetry');
    }
    this.telemetry = telemetry;
    this.milestoneTracker = milestoneTracker;
    this.state = state || null;
    this.dbAdapter = dbAdapter || null;
    this.logger = logger || console;
    this.jobId = jobId || null;
    this.ingestionCoordinator = ingestionCoordinator || new GazetteerIngestionCoordinator({ telemetry, logger: this.logger });

    this._initialized = false;
    this._status = 'idle';
    this._startedAt = null;
    this._completedAt = null;
    this._summary = null;
    this._lastProgress = null;
  }

  get status() {
    return this._status;
  }

  get summary() {
    return this._summary;
  }

  async initialize() {
    if (this._initialized) {
      return;
    }
    this._status = 'initializing';
    this._startedAt = Date.now();
    this._emitProgress({
      status: 'initializing',
      startedAt: this._startedAt
    }, { force: true });
    this.telemetry.milestoneOnce('gazetteer-mode:init', {
      kind: 'gazetteer-mode',
      message: 'Gazetteer crawl mode initializing',
      details: {
        jobId: this.jobId,
        startedAt: new Date(this._startedAt).toISOString()
      }
    });
    if (this.state && !this.state.gazetteer) {
      this.state.gazetteer = {
        status: 'initializing',
        lastUpdatedAt: this._startedAt
      };
    }
    this._initialized = true;
  }

  async run({ signal = null, emitProgress = null } = {}) {
    if (!this._initialized) {
      await this.initialize();
    }
    this._status = 'running';
    this._emitProgress({ status: 'running' }, { force: true, emitProgress });
    this.telemetry.milestoneOnce('gazetteer-mode:start', {
      kind: 'gazetteer-mode',
      message: 'Gazetteer ingestion started',
      details: {
        jobId: this.jobId,
        startedAt: new Date(this._startedAt || Date.now()).toISOString()
      }
    });

    try {
      const summary = await this.ingestionCoordinator.execute({
        signal,
        onProgress: (payload) => this._handleIngestionProgress(payload, emitProgress)
      });
      this._summary = summary;
      this._completedAt = Date.now();
      this._status = 'completed';
      const compactSummary = compactGazetteerSummary(summary);
      this._emitProgress({
        status: 'completed',
        completedAt: this._completedAt,
        summary: compactSummary
      }, { force: true, emitProgress });
      this.telemetry.milestoneOnce('gazetteer-mode:completed', {
        kind: 'gazetteer-mode',
        message: 'Gazetteer ingestion completed',
        details: {
          jobId: this.jobId,
          durationMs: summary?.durationMs || (this._completedAt - (this._startedAt || this._completedAt)),
          totals: summary?.totals || null
        }
      });
      if (this.state) {
        this.state.gazetteer = {
          status: 'completed',
          summary: compactSummary,
          lastUpdatedAt: this._completedAt
        };
      }
      return summary;
    } catch (error) {
      this._status = 'failed';
      const failedAt = Date.now();
      const problem = {
        kind: 'gazetteer-mode-failed',
        scope: this.jobId || 'gazetteer-mode',
        message: error?.message || String(error),
        details: {
          stack: error?.stack || null
        }
      };
      this.telemetry.problem(problem);
      this._emitProgress({
        status: 'failed',
        failedAt,
        error: problem.message
      }, { force: true, emitProgress });
      if (this.state) {
        this.state.gazetteer = {
          status: 'failed',
          error: problem.message,
          lastUpdatedAt: failedAt
        };
      }
      throw error;
    }
  }

  async shutdown({ reason = null } = {}) {
    const finishedAt = this._completedAt || Date.now();
    this.telemetry.milestoneOnce('gazetteer-mode:shutdown', {
      kind: 'gazetteer-mode',
      message: 'Gazetteer mode shutdown',
      details: {
        jobId: this.jobId,
        reason: reason || null,
        finishedAt: new Date(finishedAt).toISOString()
      }
    });
  }

  _handleIngestionProgress(payload, emitProgress) {
    if (!payload || typeof payload !== 'object') {
      return;
    }
    const now = Date.now();
    const progressDetails = {
      status: 'running',
      phase: payload.phase || 'progress',
      payload: payload,
      lastUpdatedAt: now
    };
    this._lastProgress = progressDetails;
    this._emitProgress(progressDetails, { emitProgress });
    if (this.state) {
      this.state.gazetteer = {
        status: 'running',
        phase: payload.phase || 'progress',
        payload,
        lastUpdatedAt: now
      };
    }
  }

  _emitProgress(data, { force = false, emitProgress = null } = {}) {
    const patch = {
      gazetteer: {
        status: data?.status || this._status,
        phase: data?.phase || null,
        summary: data?.summary || null,
        error: data?.error || null,
        startedAt: this._startedAt,
        completedAt: this._completedAt,
        lastProgress: this._lastProgress || null
      }
    };
    if (data?.completedAt) {
      patch.gazetteer.completedAt = data.completedAt;
    }
    if (data?.failedAt) {
      patch.gazetteer.failedAt = data.failedAt;
    }
    if (data?.payload) {
      patch.gazetteer.payload = data.payload;
    }
    this.telemetry.progress({ force, patch });
    if (typeof emitProgress === 'function') {
      try {
        emitProgress(patch.gazetteer);
      } catch (_) {
        // ignore listener failures
      }
    }
  }
}

function compactGazetteerSummary(summary) {
  if (!summary || typeof summary !== 'object') {
    return null;
  }
  const base = {
    durationMs: summary.durationMs || null,
    totals: summary.totals || null
  };
  if (Array.isArray(summary.ingestors)) {
    base.ingestors = summary.ingestors.map((entry) => ({
      id: entry.id,
      durationMs: entry.durationMs,
      result: sanitizeSummary(entry.result)
    }));
  }
  if (summary.startedAt) {
    base.startedAt = summary.startedAt;
  }
  if (summary.finishedAt) {
    base.finishedAt = summary.finishedAt;
  }
  return base;
}

module.exports = {
  GazetteerModeController,
  compactGazetteerSummary
};
