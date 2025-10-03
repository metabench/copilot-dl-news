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
        startup: null
      }
    });
    this.metrics = this.progress.metrics;
    this.broadcastProgress = this.progress.broadcastProgress;
    this.jobsLastSentAt = 0;
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
}

module.exports = {
  RealtimeBroadcaster
};
