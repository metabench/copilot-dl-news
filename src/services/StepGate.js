'use strict';

class StepGate {
  constructor() {
    this._enabled = false;
    this._token = 0;

    this._awaiting = null;
    this._promise = null;
    this._resolve = null;
    this._reject = null;
  }

  enable(enabled) {
    this._enabled = !!enabled;
    if (!this._enabled) {
      this._clearAwaiting();
    }
  }

  get enabled() {
    return this._enabled;
  }

  getState() {
    const awaiting = !!this._awaiting;

    return {
      enabled: this._enabled,
      awaiting,
      token: this._token,
      fromStageId: this._awaiting?.fromStageId || null,
      nextStageId: this._awaiting?.nextStageId || null,
      detail: this._awaiting?.detail || null,
      requestedAt: this._awaiting?.requestedAt || null
    };
  }

  beginAwait({ fromStageId, nextStageId, detail } = {}) {
    if (!this._enabled) return null;

    if (this._promise) {
      return this._promise;
    }

    this._token += 1;

    this._awaiting = {
      fromStageId: typeof fromStageId === 'string' ? fromStageId : null,
      nextStageId: typeof nextStageId === 'string' ? nextStageId : null,
      detail: detail && typeof detail === 'object' ? detail : null,
      requestedAt: Date.now()
    };

    this._promise = new Promise((resolve, reject) => {
      this._resolve = resolve;
      this._reject = reject;
    });

    return this._promise;
  }

  next() {
    if (!this._resolve) return false;

    const resolve = this._resolve;
    this._clearAwaiting();
    resolve(true);
    return true;
  }

  cancel(reason = 'cancelled') {
    if (!this._reject) return false;

    const reject = this._reject;
    this._clearAwaiting();

    const err = reason instanceof Error ? reason : new Error(String(reason));
    err.code = err.code || 'STEP_CANCELLED';

    reject(err);
    return true;
  }

  _clearAwaiting() {
    this._awaiting = null;
    this._promise = null;
    this._resolve = null;
    this._reject = null;
  }
}

module.exports = { StepGate };
