// Progress broadcaster helper that dedupes frames, updates metrics, and tags jobId before emitting.

function createProgressBroadcaster({ broadcast, getPaused, setPaused, legacyMetrics }) {
  if (typeof broadcast !== 'function') throw new Error('broadcast function required');
  const globalMetrics = legacyMetrics || {
    visited: 0, downloaded: 0, found: 0, saved: 0, errors: 0, queueSize: 0,
    running: 0, stage: 'idle',
    _lastSampleTime: 0, _lastVisited: 0, _lastDownloaded: 0,
    requestsPerSec: 0, downloadsPerSec: 0, errorRatePerMin: 0, bytesPerSec: 0,
    cacheHitRatio1m: 0
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
      if (dt > 0.2) {
        const dvVisited = (obj.visited || 0) - (M._lastVisited || 0);
        const dvDownloaded = (obj.downloaded || 0) - (M._lastDownloaded || 0);
        M.requestsPerSec = Math.max(0, dvVisited / dt);
        M.downloadsPerSec = Math.max(0, dvDownloaded / dt);
        const dErrors = (obj.errors || 0) - (M.errors || 0);
        M.errorRatePerMin = Math.max(0, dErrors) * (60 / dt);
        M._lastVisited = obj.visited || 0;
        M._lastDownloaded = obj.downloaded || 0;
        M._lastSampleTime = now;
      }
      M.visited = obj.visited || 0;
      M.downloaded = obj.downloaded || 0;
      M.found = obj.found || 0;
      M.saved = obj.saved || 0;
      M.errors = obj.errors || 0;
      M.queueSize = obj.queueSize || 0;
      if (obj.stage) {
        try { M.stage = obj.stage; } catch (_) {}
      }
      try {
        const last = (M._lastProgressWall || now);
        const dt2 = Math.max(0.001, (now - last) / 1000);
        if (obj.bytes != null && typeof obj.bytes === 'number') {
          const prevBytes = M._lastBytes || 0;
          const db = Math.max(0, obj.bytes - prevBytes);
          M.bytesPerSec = db / dt2;
          M._lastBytes = obj.bytes;
        }
      } catch (_) {}
      if (Object.prototype.hasOwnProperty.call(obj, 'paused')) {
        try { if (!jobMetrics && typeof setPaused === 'function') setPaused(!!obj.paused); } catch (_) {}
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
      if (!Object.prototype.hasOwnProperty.call(obj, 'jobId') || stage) {
        payload = { ...obj };
        if (!Object.prototype.hasOwnProperty.call(payload, 'jobId')) payload.jobId = jobIdForTag || (obj.jobId || null);
        if (stage) payload.stage = stage;
      }
      broadcast('progress', payload, jobIdForTag || null);
    } catch (_) {
      broadcast('progress', obj, jobIdForTag || null);
    }
  }

  return { broadcastProgress, metrics: globalMetrics };
}

module.exports = { createProgressBroadcaster };
