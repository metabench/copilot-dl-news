'use strict';

class PlannerTelemetryBridge {
  constructor({ telemetry, domain, logger = console } = {}) {
    this.telemetry = telemetry || null;
    this.domain = domain || null;
    this.logger = logger;
  }

  stageStarted({ stage, sequence, details }) {
    if (!this.telemetry || typeof this.telemetry.plannerStage !== 'function') {
      return;
    }
    this.telemetry.plannerStage({
      stage,
      status: 'started',
      sequence,
      ts: new Date().toISOString(),
      scope: this.domain || undefined,
      details: details || undefined
    });
  }

  stageCompleted({ stage, sequence, durationMs, resultDetails }) {
    if (!this.telemetry || typeof this.telemetry.plannerStage !== 'function') {
      return;
    }
    this.telemetry.plannerStage({
      stage,
      status: 'completed',
      sequence,
      durationMs,
      ts: new Date().toISOString(),
      scope: this.domain || undefined,
      details: resultDetails || undefined
    });
  }

  stageFailed({ stage, sequence, durationMs, error }) {
    if (!this.telemetry || typeof this.telemetry.plannerStage !== 'function') {
      return;
    }
    const safeError = this._normaliseFailureDetails(error);
    this.telemetry.plannerStage({
      stage,
      status: 'failed',
      sequence,
      durationMs,
      ts: new Date().toISOString(),
      scope: this.domain || undefined,
      details: safeError
    });
  }

  milestone(payload = {}) {
    if (!this.telemetry || typeof this.telemetry.milestone !== 'function') {
      return;
    }
    this.telemetry.milestone({
      scope: this.domain || undefined,
      ...payload
    });
  }

  milestoneOnce(key, payload = {}) {
    if (!this.telemetry || typeof this.telemetry.milestoneOnce !== 'function') {
      this.milestone(payload);
      return;
    }
    this.telemetry.milestoneOnce(key, {
      scope: this.domain || undefined,
      ...payload
    });
  }

  problem(payload = {}) {
    if (!this.telemetry || typeof this.telemetry.problem !== 'function') {
      return;
    }
    this.telemetry.problem({
      scope: this.domain || undefined,
      ...payload
    });
  }

  logInfo(message, ...args) {
    try {
      if (this.logger && typeof this.logger.log === 'function') {
        this.logger.log(message, ...args);
      }
    } catch (_) {
      // ignore logging failures
    }
  }

  _normaliseError(err) {
    if (!err) return undefined;
    if (typeof err === 'string') {
      return { message: err };
    }
    const out = {
      message: err.message || String(err)
    };
    if (err.code) out.code = err.code;
    if (err.stack) out.stack = err.stack;
    if (err.details) out.details = err.details;
    return out;
  }

  _normaliseFailureDetails(payload) {
    if (!payload) return undefined;
    if (typeof payload === 'object') {
      const keys = Object.keys(payload);
      if (keys.length === 0) {
        return undefined;
      }
      if (payload.error || payload.context || payload.details) {
        return payload;
      }
    }
    return this._normaliseError(payload);
  }
}

module.exports = {
  PlannerTelemetryBridge
};
