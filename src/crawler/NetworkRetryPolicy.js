class NetworkRetryPolicy {
  constructor(opts) {
    opts = opts || {};
    this.maxAttempts = Number.isFinite(opts.maxAttempts) && opts.maxAttempts > 0 ? Math.floor(opts.maxAttempts) : 3;
    this.baseDelayMs = Number.isFinite(opts.baseDelayMs) && opts.baseDelayMs >= 0 ? opts.baseDelayMs : 1000;
    this.maxDelayMs = Number.isFinite(opts.maxDelayMs) && opts.maxDelayMs >= this.baseDelayMs ? opts.maxDelayMs : 8000;
    this.jitterRatio = Number.isFinite(opts.jitterRatio) && opts.jitterRatio >= 0 ? Math.min(1, opts.jitterRatio) : 0.2;
    this.retryableErrorCodes = Array.isArray(opts.retryableErrorCodes) ? opts.retryableErrorCodes.slice() : ['ECONNRESET', 'EPIPE', 'ETIMEDOUT', 'EAI_AGAIN', 'ECONNREFUSED', 'ENETUNREACH', 'EHOSTUNREACH', 'ENOTFOUND'];
    this.randomFn = typeof opts.randomFn === 'function' ? opts.randomFn : Math.random;
  }

  // Returns true if the given error (or object) is considered a retryable network error
  isRetryableError(error) {
    if (!error) return false;
    const msg = (error && (error.message || String(error))) || '';
    const code = typeof (error && error.code) === 'string' ? error.code : null;
    const isConnectionReset = code === 'ECONNRESET' || /ECONNRESET|socket hang up/i.test(String(msg));
    const isTimeout = error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(msg)));
    const isRetryableCode = code ? this.retryableErrorCodes.includes(code) : false;
    const transientPattern = /ECONNRESET|ECONNREFUSED|EPIPE|ETIMEDOUT|EAI_AGAIN|ENOTFOUND|ENETUNREACH|EHOSTUNREACH|network/i;
    const isTransientMessage = transientPattern.test(String(msg));
    return isConnectionReset || isTimeout || isRetryableCode || isTransientMessage;
  }

  // Strategy name for classification
  strategyFor(error) {
    const msg = (error && (error.message || String(error))) || '';
    const code = typeof (error && error.code) === 'string' ? error.code : null;
    const isConnectionReset = code === 'ECONNRESET' || /ECONNRESET|socket hang up/i.test(String(msg));
    const isTimeout = error && (error.name === 'AbortError' || /aborted|timeout/i.test(String(msg)));
    if (isTimeout) return 'timeout';
    if (isConnectionReset) return 'connection-reset';
    if (code && this.retryableErrorCodes.includes(code)) return 'network-code';
    return 'network';
  }

  // Maximum retries (0-based) allowed
  maxRetries() {
    return Math.max(0, this.maxAttempts - 1);
  }

  // Compute delay for a retry. attemptIndex is zero-based (0 => first retry after initial failure)
  computeDelay({ attemptIndex = 0, retryAfterMs = null } = {}) {
    // If server provided Retry-After, use it as a base but clamp to bounds
    let base = this.baseDelayMs;
    if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
      base = Math.max(this.baseDelayMs, Math.min(this.maxDelayMs, Math.floor(retryAfterMs)));
    } else {
      const exponential = this.baseDelayMs * Math.pow(2, attemptIndex);
      base = Math.max(this.baseDelayMs, Math.min(this.maxDelayMs, exponential || this.baseDelayMs));
    }
    const jitter = this.jitterRatio > 0 ? Math.round(base * this.jitterRatio * (this.randomFn ? this.randomFn() : Math.random())) : 0;
    const delay = Math.max(0, Math.min(this.maxDelayMs, base + jitter));
    return delay;
  }
}

module.exports = NetworkRetryPolicy;
