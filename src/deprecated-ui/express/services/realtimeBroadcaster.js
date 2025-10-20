const { createBroadcaster } = require('./broadcast');
const { createProgressBroadcaster } = require('./progress');

class RealtimeBroadcaster {
  constructor({
    jobRegistry,
    logsMaxPerSec = Number(process.env.UI_LOGS_MAX_PER_SEC || 200),
    logLineMaxChars = Number(process.env.UI_LOG_LINE_MAX_CHARS || 8192)
  } = {}) {
    if (!jobRegistry) {
      throw new Error('RealtimeBroadcaster requires a JobRegistry instance');
    }
    this.jobRegistry = jobRegistry;
    this.sseClients = new Set();
    this.broadcaster = createBroadcaster(this.sseClients, {
      logsMaxPerSec,
      logLineMaxChars
    });
    this.progress = createProgressBroadcaster({
      broadcast: (...args) => this.broadcast(...args),
      getPaused: () => this.jobRegistry.isPaused(),
      setPaused: (value) => this.jobRegistry.setPaused(value),
      legacyMetrics: {
        visited: 0,
        downloaded: 0,
        found: 0,
        saved: 0,
        errors: 0,
        queueSize: 0,
        running: 0,
        stage: 'idle',
        _lastSampleTime: 0,
        _lastVisited: 0,
        _lastDownloaded: 0,
        requestsPerSec: 0,
        downloadsPerSec: 0,
        errorRatePerMin: 0,
        bytesPerSec: 0,
        cacheHitRatio1m: 0,
        statusText: null,
        startup: null,
        slowMode: false,
        slowModeReason: null
      }
    });
    this.metrics = this.progress.metrics;
    this.broadcastProgress = this.progress.broadcastProgress;
    this.jobsLastSentAt = 0;
    this.telemetryHistory = [];
    this.telemetryMaxEntries = 200;
    this.planStatusHistory = [];
    this.planPreviewHistory = [];
    this.planStatusHistoryLimit = 50;
    this.planPreviewHistoryLimit = 20;
  }

  getMetrics() {
    return this.metrics;
  }

  getProgress() {
    return this.progress;
  }

  getBroadcastProgress() {
    return this.broadcastProgress;
  }

  getBroadcaster() {
    return this.broadcaster;
  }

  getSseClients() {
    return this.sseClients;
  }

  broadcast(event, data, forcedJobId = null) {
    if (event === 'plan-status') {
      this._recordPlanEvent(this.planStatusHistory, data, this.planStatusHistoryLimit);
    } else if (event === 'plan-preview') {
      this._recordPlanEvent(this.planPreviewHistory, data, this.planPreviewHistoryLimit);
    }

    return this.broadcaster.broadcast(event, data, forcedJobId);
  }

  broadcastJobs(force = false) {
    const now = Date.now();
    if (!force && now - this.jobsLastSentAt < 200) return;
    this.jobsLastSentAt = now;
    const payload = this.jobRegistry.getSummary();
    if (payload) {
      this.broadcast('jobs', payload);
    }
  }

  registerClient(client) {
    this.sseClients.add(client);
  }

  removeClient(client) {
    this.sseClients.delete(client);
  }

  getTelemetryHistory() {
    return this.telemetryHistory.slice();
  }

  getPlanStatusHistory() {
    return this.planStatusHistory.slice();
  }

  getPlanPreviewHistory() {
    return this.planPreviewHistory.slice();
  }

  broadcastTelemetry(entry = {}) {
    if (!entry || typeof entry !== 'object') return;
    const now = new Date();
    const telemetryEntry = {
      id: entry.id || `telemetry-${now.getTime()}-${Math.random().toString(16).slice(2, 8)}`,
      ts: entry.ts || now.toISOString(),
      source: entry.source || 'unknown',
      event: entry.event || 'log',
      severity: entry.severity || 'info',
      message: entry.message || '',
      details: entry.details || undefined,
      data: entry.data || undefined,
      taskId: entry.taskId || undefined,
      taskType: entry.taskType || undefined,
      status: entry.status || undefined
    };
    if (!telemetryEntry.message && telemetryEntry.details && typeof telemetryEntry.details === 'string') {
      telemetryEntry.message = telemetryEntry.details;
    }
    this.telemetryHistory.push(telemetryEntry);
    if (this.telemetryHistory.length > this.telemetryMaxEntries) {
      this.telemetryHistory.splice(0, this.telemetryHistory.length - this.telemetryMaxEntries);
    }
    this.broadcast('telemetry', telemetryEntry);
  }

  getBroadcastTelemetry() {
    return (entry) => this.broadcastTelemetry(entry);
  }

  _recordPlanEvent(collection, payload, limit) {
    if (!payload || typeof payload !== 'object') return;
    const clone = { ...payload };
    if (clone.session && typeof clone.session === 'object') {
      clone.session = { ...clone.session };
    }
    const sessionId = clone.sessionId || null;
    if (sessionId) {
      const existingIndex = collection.findIndex((entry) => entry.sessionId === sessionId);
      if (existingIndex !== -1) {
        collection.splice(existingIndex, 1);
      }
    }
    collection.push(clone);
    if (collection.length > limit) {
      collection.splice(0, collection.length - limit);
    }
  }
}

module.exports = {
  RealtimeBroadcaster
};
