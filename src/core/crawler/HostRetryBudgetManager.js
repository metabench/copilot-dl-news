const { safeCall } = require('./utils');

class HostRetryBudgetManager {
  constructor(opts) {
    opts = opts || {};
    this.maxErrors = Number.isFinite(opts.maxErrors) && opts.maxErrors > 0 ? Math.floor(opts.maxErrors) : 6;
    this.windowMs = Number.isFinite(opts.windowMs) && opts.windowMs > 0 ? opts.windowMs : 5 * 60 * 1000;
    this.lockoutMs = Number.isFinite(opts.lockoutMs) && opts.lockoutMs > 0 ? opts.lockoutMs : 2 * 60 * 1000;
    this.telemetry = opts.telemetry || null;
    this.logger = opts.logger || console;
    this._state = new Map();
  }

  _emitHostBudgetTelemetry(stage, host, state, extras = {}) {
    if (!this.telemetry || typeof this.telemetry.telemetry !== 'function') return;
    safeCall(() => {
      this.telemetry.telemetry({
        severity: stage === 'exhausted' ? 'warning' : 'info',
        event: 'fetch.host-retry-budget',
        stage,
        host,
        failures: state?.failures ?? 0,
        maxFailures: this.maxErrors,
        windowMs: this.windowMs,
        lockoutMs: this.lockoutMs,
        lockExpiresAtIso: state?.lockExpiresAt ? new Date(state.lockExpiresAt).toISOString() : null,
        firstFailureAtIso: state?.firstFailureAt ? new Date(state.firstFailureAt).toISOString() : null,
        lastFailureAtIso: state?.lastFailureAt ? new Date(state.lastFailureAt).toISOString() : null,
        ...extras
      });
    });
  }

  check(host) {
    if (!host) return { locked: false, failures: 0, state: null };
    const state = this._state.get(host);
    if (!state) return { locked: false, failures: 0, state: null };
    const now = Date.now();
    if (state.lockExpiresAt && state.lockExpiresAt <= now) {
      this._state.delete(host);
      return { locked: false, failures: 0, state: null };
    }
    if (state.firstFailureAt && (now - state.firstFailureAt) > this.windowMs) {
      this._state.delete(host);
      return { locked: false, failures: 0, state: null };
    }
    if (state.lockExpiresAt && state.lockExpiresAt > now) {
      return { locked: true, retryAfterMs: state.lockExpiresAt - now, retryAt: state.lockExpiresAt, failures: state.failures, state };
    }
    return { locked: false, failures: state.failures, state };
  }

  noteFailure(host, meta = {}) {
    if (!host) return;
    const now = Date.now();
    let state = this._state.get(host);
    if (!state) {
      state = { failures: 0, firstFailureAt: now, lastFailureAt: now, lockExpiresAt: null, lastMeta: null };
    } else {
      if (state.lockExpiresAt && state.lockExpiresAt <= now) {
        state.failures = 0;
        state.lockExpiresAt = null;
        state.firstFailureAt = now;
      }
      if (state.firstFailureAt && (now - state.firstFailureAt) > this.windowMs) {
        state.failures = 0;
        state.firstFailureAt = now;
      }
      state.lastFailureAt = now;
    }
    state.failures += 1;
    if (!state.firstFailureAt) state.firstFailureAt = now;
    state.lastMeta = meta || null;
    if (state.failures >= this.maxErrors) {
      if (!state.lockExpiresAt || state.lockExpiresAt <= now) {
        state.lockExpiresAt = now + this.lockoutMs;
        this.logger.warn(`[network] host retry budget exhausted for ${host}; lockout until ${new Date(state.lockExpiresAt).toISOString()}`);
        this._emitHostBudgetTelemetry('exhausted', host, state, meta);
      }
    }
    this._state.set(host, state);
  }

  noteSuccess(host) {
    if (!host) return;
    const state = this._state.get(host);
    if (!state) return;
    this._state.delete(host);
    this._emitHostBudgetTelemetry('reset', host, state);
  }
}

module.exports = HostRetryBudgetManager;
