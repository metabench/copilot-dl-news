'use strict';

const { PlannerTelemetryBridge } = require('./PlannerTelemetryBridge');

class PlannerOrchestrator {
  constructor({
    telemetryBridge,
    logger = console,
    enabled = true
  } = {}) {
    this.telemetry = telemetryBridge instanceof PlannerTelemetryBridge ? telemetryBridge : new PlannerTelemetryBridge({ telemetry: null });
    this.logger = logger;
    this.enabled = enabled;
    this._stageSeq = 0;
    this._summaryReducers = [];
  }

  setEnabled(enabled) {
    this.enabled = !!enabled;
  }

  registerSummaryReducer(reducer) {
    if (typeof reducer === 'function') {
      this._summaryReducers.push(reducer);
    }
  }

  buildSummary(initialSummary = {}) {
    return this._summaryReducers.reduce((acc, reducer) => {
      try {
        const next = reducer(acc);
        return next || acc;
      } catch (error) {
        this._logWarn('Planner summary reducer failed', error);
        return acc;
      }
    }, { ...initialSummary });
  }

  async runStage(stageName, contextDetails, fn, options = {}) {
    if (typeof fn !== 'function') {
      return undefined;
    }

    if (!this.enabled) {
      return fn();
    }

    const seq = this._nextSequence();
    const context = this._normaliseContext(contextDetails);
    const startTime = Date.now();

    this.telemetry.stageStarted({
      stage: stageName,
      sequence: seq,
      details: context ? { context } : undefined
    });

    try {
      const result = await fn();
      const durationMs = Date.now() - startTime;
      const mapped = this._mapResult(options.mapResultForEvent, result);
      const resultDetails = this._composeCompletionDetails(context, mapped);

      this.telemetry.stageCompleted({
        stage: stageName,
        sequence: seq,
        durationMs,
        resultDetails
      });

      this._applySummaryReducer(options.updateSummaryWithResult, result);
      return result;
    } catch (error) {
      const durationMs = Date.now() - startTime;
      this.telemetry.stageFailed({
        stage: stageName,
        sequence: seq,
        durationMs,
        error: this._failureDetails(context, error)
      });
      throw error;
    }
  }

  _applySummaryReducer(reducer, result) {
    if (typeof reducer !== 'function') return;
    this.registerSummaryReducer((currentSummary) => reducer(currentSummary, result));
  }

  _composeCompletionDetails(context, mapped) {
    const details = {};
    if (context) {
      details.context = context;
    }
    if (mapped !== undefined) {
      if (mapped && typeof mapped === 'object') {
        const keys = Object.keys(mapped);
        if (keys.length) {
          details.result = mapped;
        }
      } else {
        details.result = mapped;
      }
    }
    return Object.keys(details).length ? details : undefined;
  }

  _failureDetails(context, error) {
    const out = context ? { context } : {};
    out.error = {
      message: error?.message || String(error)
    };
    if (error?.code) out.error.code = error.code;
    if (error?.stack) out.error.stack = error.stack;
    if (error?.details) out.error.details = error.details;
    return out;
  }

  _mapResult(mapper, result) {
    if (typeof mapper !== 'function') {
      return result;
    }
    try {
      return mapper(result);
    } catch (error) {
      this._logWarn('Planner stage mapper failed', error);
      return null;
    }
  }

  _normaliseContext(details) {
    if (!details || typeof details !== 'object') {
      return null;
    }
    if (Array.isArray(details) && details.length === 0) {
      return null;
    }
    if (!Array.isArray(details) && Object.keys(details).length === 0) {
      return null;
    }
    return details;
  }

  _nextSequence() {
    this._stageSeq += 1;
    if (this._stageSeq > Number.MAX_SAFE_INTEGER) {
      this._stageSeq = 1;
    }
    return this._stageSeq;
  }

  _logWarn(message, error) {
    try {
      if (this.logger && typeof this.logger.warn === 'function') {
        this.logger.warn(message, error?.message || error);
      }
    } catch (_) {
      // ignore logging errors
    }
  }
}

module.exports = {
  PlannerOrchestrator
};
