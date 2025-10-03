// Progress broadcaster helper that dedupes frames, updates metrics, and tags jobId before emitting.

const { touchMetrics } = require('./metricsFormatter');

function createProgressBroadcaster({ broadcast, getPaused, setPaused, legacyMetrics }) {
  if (typeof broadcast !== 'function') throw new Error('broadcast function required');
  const globalMetrics = legacyMetrics || {
    visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0,
    running: 0, stage: 'idle',
    _lastSampleTime: 0, _lastVisited: 0, _lastDownloaded: 0,
    requestsPerSec: 0, downloadsPerSec: 0, errorRatePerMin: 0, bytesPerSec: 0,
    cacheHitRatio1m: 0,
    slowMode: false,
    slowModeReason: null
  };

  function broadcastProgress(obj, jobIdForTag = null, jobMetrics = null) {
    try {
      const now = Date.now();
      const s = JSON.stringify(obj);
      // Deduplicate/throttle per job or global
      if (jobMetrics) {
        if (s === jobMetrics._lastProgressStr && now - (jobMetrics._lastProgressSentAt || 0) < 200) return;
        jobMetrics._lastProgressStr = s; jobMetrics._lastProgressSentAt = now;
      }
      // Update metrics (global or per job)
      const M = jobMetrics || globalMetrics;
      const prevTime = M._lastSampleTime || now;
      const dt = (now - prevTime) / 1000;
      const nextVisited = Number(obj.visited) || 0;
      const nextDownloaded = Number(obj.downloaded) || 0;
      const nextFound = Number(obj.found) || 0;
      const nextSaved = Number(obj.saved) || 0;
      const nextErrors = Number(obj.errors) || 0;
      const nextQueueSize = Number(obj.queueSize) || 0;

      let dirty = false;
      let stageChanged = false;
      let pausedChanged = false;
      const updateInt = (key, value) => {
        const current = Number(M[key]) || 0;
        if (current !== value) {
          dirty = true;
          M[key] = value;
        } else if (!Object.prototype.hasOwnProperty.call(M, key)) {
          M[key] = value;
        }
      };
      const updateFloat = (key, value, epsilon = 1e-6) => {
        const current = Number.isFinite(M[key]) ? M[key] : 0;
        const next = Number.isFinite(value) ? value : 0;
        if (!Number.isFinite(current) || Math.abs(current - next) > epsilon) {
          dirty = true;
          M[key] = next;
        } else if (!Number.isFinite(M[key])) {
          M[key] = next;
        }
      };

      const prevErrors = Number(M.errors) || 0;
      if (dt > 0.2) {
        const dvVisited = nextVisited - (M._lastVisited || 0);
        const dvDownloaded = nextDownloaded - (M._lastDownloaded || 0);
        updateFloat('requestsPerSec', Math.max(0, dvVisited / dt));
        updateFloat('downloadsPerSec', Math.max(0, dvDownloaded / dt));
        const dErrors = nextErrors - prevErrors;
        updateFloat('errorRatePerMin', Math.max(0, dErrors) * (60 / dt));
        M._lastVisited = nextVisited;
        M._lastDownloaded = nextDownloaded;
        M._lastSampleTime = now;
      }

      updateInt('visited', nextVisited);
      updateInt('downloaded', nextDownloaded);
      updateInt('found', nextFound);
      updateInt('saved', nextSaved);
      updateInt('errors', nextErrors);
      updateInt('queueSize', nextQueueSize);

      const currentStage = typeof M.stage === 'string' ? M.stage : null;
      if (obj.stage) {
        if (obj.stage !== currentStage) {
          stageChanged = true;
          dirty = true;
        }
        try { M.stage = obj.stage; } catch (_) {}
      }

      try {
        const last = (M._lastProgressWall || now);
        const dt2 = Math.max(0.001, (now - last) / 1000);
        if (obj.bytes != null && typeof obj.bytes === 'number') {
          const prevBytes = M._lastBytes || 0;
          const db = Math.max(0, obj.bytes - prevBytes);
          updateFloat('bytesPerSec', db / dt2, 1e-3);
          M._lastBytes = obj.bytes;
        }
      } catch (_) {}

      if (Object.prototype.hasOwnProperty.call(obj, 'paused')) {
        const paused = !!obj.paused;
        if (M.paused !== paused) {
          pausedChanged = true;
          dirty = true;
        }
        try {
          if (!jobMetrics && typeof setPaused === 'function') setPaused(paused);
        } catch (_) {}
        try { M.paused = paused; } catch (_) {}
      }

      M._lastProgressWall = now;
      try { if (jobMetrics) jobMetrics._lastPayload = { ...obj }; } catch (_) {}
      let payload = obj;
      const stage = obj.stage || (jobMetrics && jobMetrics.stage) || null;
      if (Object.prototype.hasOwnProperty.call(obj, 'statusText')) {
        try { M.statusText = obj.statusText; } catch (_) {}
      }
      if (Object.prototype.hasOwnProperty.call(obj, 'startup')) {
        try { M.startup = obj.startup; } catch (_) {}
      }
      const ensurePayload = () => {
        if (payload === obj) {
          payload = { ...obj };
        }
        return payload;
      };
      const domainLimited = Object.prototype.hasOwnProperty.call(obj, 'domainRateLimited')
        ? !!obj.domainRateLimited
        : (Object.prototype.hasOwnProperty.call(payload, 'domainRateLimited') ? !!payload.domainRateLimited : null);
      if (!Object.prototype.hasOwnProperty.call(obj, 'slowMode') && domainLimited != null) {
        const nextPayload = ensurePayload();
        nextPayload.slowMode = domainLimited;
      }
      if (!Object.prototype.hasOwnProperty.call(obj, 'slowModeReason')) {
        const nextPayload = ensurePayload();
        if (Object.prototype.hasOwnProperty.call(nextPayload, 'slowMode') && nextPayload.slowMode) {
          if (!Object.prototype.hasOwnProperty.call(nextPayload, 'slowModeReason')) {
            const reasonCandidates = [
              obj.slowModeReason,
              obj.domainRateLimitReason,
              obj.domainLastStatus,
              obj.domainBackoffReason,
              (typeof obj.domainBackoffMs === 'number' && obj.domainBackoffMs > 0) ? `backoff ${Math.ceil(obj.domainBackoffMs)}ms` : null,
              obj.statusText,
              (obj.domainLimit ? `${obj.domainLimit}/min` : null)
            ];
            let reason = null;
            for (const candidate of reasonCandidates) {
              if (candidate == null) continue;
              const str = String(candidate).trim();
              if (str) {
                reason = str;
                break;
              }
            }
            if (!reason) reason = 'rate-limited';
            nextPayload.slowModeReason = reason;
          }
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'slowMode')) {
        const nextSlowMode = !!payload.slowMode;
        if (M.slowMode !== nextSlowMode) {
          dirty = true;
          try { M.slowMode = nextSlowMode; } catch (_) {}
        }
      }
      if (Object.prototype.hasOwnProperty.call(payload, 'slowModeReason')) {
        const nextReason = payload.slowModeReason == null ? null : String(payload.slowModeReason);
        if (M.slowModeReason !== nextReason) {
          dirty = true;
          try { M.slowModeReason = nextReason; } catch (_) {}
        }
      }
      if (!Object.prototype.hasOwnProperty.call(obj, 'jobId') || stage) {
        const nextPayload = ensurePayload();
        if (!Object.prototype.hasOwnProperty.call(nextPayload, 'jobId')) nextPayload.jobId = jobIdForTag || (obj.jobId || null);
        if (stage) nextPayload.stage = stage;
      }
      touchMetrics(M, {
        stage: stageChanged ? M.stage : undefined,
        paused: pausedChanged ? M.paused : undefined,
        dirty
      });
      broadcast('progress', payload, jobIdForTag || null);
    } catch (_) {
      broadcast('progress', obj, jobIdForTag || null);
    }
  }

  return { broadcastProgress, metrics: globalMetrics };
}

module.exports = { createProgressBroadcaster };
