const { exec } = require('child_process');
const { newJobIdFactory, computeJobsSummary } = require('./jobs');

class JobRegistry {
  constructor({
    allowMultiJobs = false,
    guardWindowMs = 600,
    metrics = null,
    summaryFn = computeJobsSummary
  } = {}) {
    this.allowMultiJobs = allowMultiJobs;
    this.guardWindowMs = guardWindowMs;
    this.metrics = metrics;
    this.summaryFn = typeof summaryFn === 'function' ? summaryFn : computeJobsSummary;
    this.jobs = new Map();
    this._newJobId = newJobIdFactory();
    this.crawlState = {
      jobStartGuardUntil: 0,
      startedAt: null,
      lastExit: null,
      paused: false
    };
    this.killDelayMs = 800;
  }

  getJobs() {
    return this.jobs;
  }

  getJob(jobId) {
    if (!jobId) return null;
    return this.jobs.get(jobId) || null;
  }

  getFirstJob() {
    return this.jobs.size ? this.jobs.values().next().value : null;
  }

  jobCount() {
    return this.jobs.size;
  }

  getCrawlState() {
    return this.crawlState;
  }

  isPaused() {
    return !!this.crawlState.paused;
  }

  setPaused(paused) {
    this.crawlState.paused = !!paused;
  }

  checkStartAllowed(now = Date.now()) {
    if (this.allowMultiJobs) {
      return { ok: true };
    }
    if (this.jobs.size > 0) {
      return { ok: false, reason: 'already-running' };
    }
    if (now < this.crawlState.jobStartGuardUntil) {
      return { ok: false, reason: 'guard-window' };
    }
    return { ok: true };
  }

  reserveStartGuard(now = Date.now()) {
    this.crawlState.jobStartGuardUntil = now + this.guardWindowMs;
  }

  reserveJobId() {
    return this._newJobId();
  }

  registerJob(job) {
    if (!job || !job.id) {
      throw new Error('JobRegistry.registerJob requires a job with an id');
    }
    const wasEmpty = this.jobs.size === 0;
    this.jobs.set(job.id, job);
    this.reserveStartGuard();
    if (wasEmpty) {
      this._onFirstJobStart(job);
    }
    return job;
  }

  createJob({ child, args = [], url = null, stage = 'preparing' } = {}) {
    const status = this.checkStartAllowed();
    if (!status.ok) {
      const err = new Error(status.reason || 'job-start-blocked');
      err.code = status.reason || 'job-start-blocked';
      throw err;
    }
    const jobId = this.reserveJobId();
    const job = {
      id: jobId,
      child: child || null,
      args: Array.isArray(args) ? [...args] : [],
      url: url || null,
      startedAt: new Date().toISOString(),
      lastExit: null,
      paused: false,
      stdoutBuf: '',
      stderrBuf: '',
      stage,
      stageChangedAt: Date.now(),
      stdin: child && typeof child.stdin?.write === 'function' ? child.stdin : null,
      metrics: {
        visited: 0,
        downloaded: 0,
        found: 0,
        saved: 0,
        errors: 0,
        queueSize: 0,
        running: 1,
        _lastSampleTime: Date.now(),
        _lastVisited: 0,
        _lastDownloaded: 0,
        requestsPerSec: 0,
        downloadsPerSec: 0,
        errorRatePerMin: 0,
        bytesPerSec: 0,
        stage
      },
      watchdogTimers: [],
      killTimer: null
    };
    return this.registerJob(job);
  }

  _onFirstJobStart(job) {
    this.crawlState.startedAt = job.startedAt;
    this.crawlState.lastExit = null;
    this.crawlState.paused = false;
    if (this.metrics && typeof this.metrics === 'object') {
      this.metrics.running = 1;
      this.metrics._lastSampleTime = Date.now();
      this.metrics._lastVisited = 0;
      this.metrics._lastDownloaded = 0;
      try {
        this.metrics.stage = job.stage || 'preparing';
      } catch (_) {}
    }
  }

  updateJobStage(job, stage) {
    if (!job) return;
    const next = stage || 'running';
    if (job.stage === next) return;
    job.stage = next;
    job.stageChangedAt = Date.now();
    if (job.metrics) {
      try {
        job.metrics.stage = next;
      } catch (_) {}
    }
    const first = this.getFirstJob();
    if (first && first.id === job.id && this.metrics) {
      try {
        this.metrics.stage = next;
      } catch (_) {}
    }
  }

  clearJobWatchdogs(job) {
    if (!job || !Array.isArray(job.watchdogTimers)) return;
    while (job.watchdogTimers.length) {
      const timer = job.watchdogTimers.pop();
      try {
        clearTimeout(timer);
      } catch (_) {}
    }
  }

  markJobExit(job, exitInfo) {
    if (!job) return;
    job.lastExit = exitInfo || null;
    job.child = null;
    job.stdin = null;
    job.paused = false;
    this.crawlState.lastExit = exitInfo || null;
  }

  removeJob(jobId) {
    this.jobs.delete(jobId);
    if (this.jobs.size === 0) {
      this.crawlState.startedAt = null;
      this.crawlState.paused = false;
      if (this.metrics && typeof this.metrics === 'object') {
        this.metrics.running = 0;
        try {
          this.metrics.stage = 'idle';
        } catch (_) {}
      }
    }
  }

  stopJob(jobId, { escalateDelayMs = this.killDelayMs } = {}) {
    const job = jobId ? this.jobs.get(jobId) : this.getFirstJob();
    if (!job) {
      return { ok: false, error: 'not-found' };
    }
    const target = job.child;
    if (typeof target?.kill === 'function') {
      target.kill('SIGTERM');
    }
    if (job.killTimer) {
      try {
        clearTimeout(job.killTimer);
      } catch (_) {}
      job.killTimer = null;
    }
    job.killTimer = setTimeout(() => {
      try {
        if (target && !target.killed) {
          try {
            target.kill('SIGKILL');
          } catch (_) {}
          if (process.platform === 'win32' && target.pid) {
            try {
              exec(`taskkill /PID ${target.pid} /T /F`);
            } catch (_) {}
          }
        }
      } catch (_) {}
    }, escalateDelayMs);
    try {
      job.killTimer?.unref?.();
    } catch (_) {}
    return { ok: true, escalatesInMs: escalateDelayMs, job };
  }

  pauseJob(jobId) {
    const job = jobId ? this.jobs.get(jobId) : this.getFirstJob();
    if (!job) return { ok: false, error: 'not-found' };
    const stdin = job.stdin || (job.child && job.child.stdin);
    if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
      stdin.write('PAUSE\n');
      job.paused = true;
      this.setPaused(true);
      return { ok: true, job };
    }
    return { ok: false, error: 'stdin-unavailable', job };
  }

  resumeJob(jobId) {
    const job = jobId ? this.jobs.get(jobId) : this.getFirstJob();
    if (!job) return { ok: false, error: 'not-found' };
    const stdin = job.stdin || (job.child && job.child.stdin);
    if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
      stdin.write('RESUME\n');
      job.paused = false;
      this.setPaused(false);
      return { ok: true, job };
    }
    return { ok: false, error: 'stdin-unavailable', job };
  }

  getSummary() {
    if (typeof this.summaryFn !== 'function') return null;
    return this.summaryFn(this.jobs);
  }
}

module.exports = {
  JobRegistry
};
