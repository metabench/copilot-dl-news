class ErrorTracker {
  constructor({
    state,
    telemetry,
    domain,
    connectionResetWindowMs,
    connectionResetThreshold,
    requestAbort
  } = {}) {
    if (!state) {
      throw new Error('ErrorTracker requires a state instance');
    }
    this.state = state;
    this.telemetry = telemetry || null;
    this.domain = domain || null;
    this.connectionResetWindowMs = typeof connectionResetWindowMs === 'number' ? connectionResetWindowMs : 2 * 60 * 1000;
    this.connectionResetThreshold = typeof connectionResetThreshold === 'number' ? connectionResetThreshold : 3;
    this.requestAbort = typeof requestAbort === 'function' ? requestAbort : () => {};
  }

  record(sample) {
    if (!sample || typeof sample !== 'object') {
      return;
    }
    const normalized = {
      kind: sample.kind || 'unknown',
      code: sample.code != null ? sample.code : null,
      message: sample.message || null,
      url: sample.url || null
    };
    this.state.setLastError(normalized);
    this.state.addErrorSample(normalized);
  }

  handleConnectionReset(url, error) {
    if (this.state.hasEmittedConnectionResetProblem()) return;
    let host = this.domain;
    try {
      if (url) host = new URL(url).hostname || host;
    } catch (_) {}
    const now = Date.now();
    const windowMs = this.connectionResetWindowMs;
    const threshold = this.connectionResetThreshold;
    const entry = this.state.getConnectionResetState(host) || {
      count: 0,
      firstAt: now,
      lastAt: now
    };
    if (now - entry.firstAt > windowMs) {
      entry.count = 0;
      entry.firstAt = now;
    }
    entry.count += 1;
    entry.lastAt = now;
    this.state.setConnectionResetState(host, entry);
    if (entry.count >= threshold) {
      this.state.markConnectionResetProblemEmitted();
      const message = `Repeated connection resets detected (${entry.count} within ${Math.round(windowMs / 1000)}s)`;
      const details = {
        host,
        count: entry.count,
        windowMs,
        firstAt: new Date(entry.firstAt).toISOString(),
        lastAt: new Date(entry.lastAt).toISOString(),
        sampleUrl: url || null,
        errorCode: error && error.code ? error.code : null,
        errorMessage: error && error.message ? error.message : null
      };
      try {
        this.telemetry?.problem({
          kind: 'connection-reset',
          scope: this.domain,
          target: host,
          message: `${message}; crawl aborted`,
          details
        });
      } catch (_) {}
      this.requestAbort('connection-reset', {
        ...details,
        message: `${message} for ${host}`
      });
    }
  }

  determineOutcomeError(stats) {
    const fatalIssues = this.state.getFatalIssues();
    if (Array.isArray(fatalIssues) && fatalIssues.length > 0) {
      const summary = fatalIssues
        .map((issue) => issue && (issue.message || issue.reason || issue.kind))
        .filter(Boolean)
        .join('; ');
      const err = new Error(`Crawl failed: ${summary || 'fatal initialization error'}`);
      err.code = 'CRAWL_FATAL';
      err.details = {
        issues: fatalIssues.slice(0, 5)
      };
      return err;
    }
    const pagesDownloaded = stats?.pagesDownloaded || 0;
    const errorCount = stats?.errors || 0;
    const noDownloads = pagesDownloaded === 0;
    const hadErrors = errorCount > 0;
    if (noDownloads && hadErrors) {
      const errorSamples = this.state.getErrorSamples();
      const sample = Array.isArray(errorSamples) ? errorSamples[0] : null;
      const detail = sample ? `${sample.kind || 'error'}${sample.code ? ` ${sample.code}` : ''}${sample.url ? ` ${sample.url}` : ''}`.trim() : null;
      const err = new Error(`Crawl failed: no pages downloaded after ${errorCount} error${errorCount === 1 ? '' : 's'}${detail ? ` (first: ${detail})` : ''}`);
      err.code = 'CRAWL_NO_PROGRESS';
      err.details = {
        stats: {
          ...(stats || {})
        },
        sampleError: sample || null
      };
      return err;
    }
    return null;
  }
}

module.exports = {
  ErrorTracker
};
