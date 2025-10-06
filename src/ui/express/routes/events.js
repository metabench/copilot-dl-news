const express = require('express');
const { each, tof, is_array } = require('lang-tools');

// Factory to create the SSE router. We pass dependencies to avoid changing global behavior.
function createEventsRouter({ realtime, jobRegistry, QUIET, analysisProgress }) {
  if (!realtime) throw new Error('events router requires realtime broadcaster');
  if (!jobRegistry) throw new Error('events router requires jobRegistry');
  const sseClients = realtime.getSseClients();
  const jobs = jobRegistry.getJobs();
  const router = express.Router();
  const broadcast = (event, data, forcedJobId = null) => realtime.broadcast(event, data, forcedJobId);
  const progress = realtime.getProgress();

  router.get('/events', (req, res) => {
    // Strong SSE headers to avoid proxy buffering and enable streaming
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('X-Accel-Buffering', 'no');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const logsEnabled = String(req.query?.logs ?? '1') !== '0';
    const jobFilter = (req.query && typeof req.query.job === 'string') ? String(req.query.job) : null;
    const heartbeat = setInterval(() => {
      try {
        res.write(`: ping\n\n`);
        res.flush?.();
      } catch (_) {}
    }, 10000);
    try { heartbeat.unref?.(); } catch (_) {}

  const client = { res, logsEnabled, heartbeat, jobFilter };
  realtime.registerClient(client);
    try { console.log(`[sse] connect logs=${logsEnabled} clients=${sseClients.size}`); } catch (_) {}

    // Seed a one-time log line for immediate feedback
    try { if (logsEnabled) broadcast('log', { stream: 'server', line: '[sse] log stream enabled\n' }); } catch (_) {}
    // Optional: emit a very long server-side log line to validate truncation behavior
    try {
      const wantLong = String(process.env.UI_FAKE_LONGLOG || process.env.UI_FAKE_RUNNER_LONGLOG || '').toLowerCase() === '1';
      if (logsEnabled && wantLong) {
        const long = 'S'.repeat(12000) + '\n';
        broadcast('log', { stream: 'server', line: long });
      }
    } catch (_) {}

    // Seed progress snapshot(s) for currently running jobs
    try {
      if (jobs.size > 0) {
        for (const [id, j] of jobs.entries()) {
          const m = j.metrics || {};
          const lastPayload = (m && typeof m._lastPayload === 'object') ? m._lastPayload : null;
          if (lastPayload) {
            const enriched = { ...lastPayload, paused: !!j.paused };
            if (!Object.prototype.hasOwnProperty.call(enriched, 'stage') && j.stage) enriched.stage = j.stage;
            broadcast('progress', { ...enriched, jobId: id }, id);
          } else {
            const snapshot = {
              visited: m.visited || 0,
              downloaded: m.downloaded || 0,
              found: m.found || 0,
              saved: m.saved || 0,
              errors: m.errors || 0,
              queueSize: m.queueSize || 0,
              paused: !!j.paused,
              stage: j.stage || (j.child ? 'running' : 'done'),
              statusText: m.statusText || null,
              startup: m.startup || null
            };
            broadcast('progress', { ...snapshot, jobId: id }, id);
          }
        }
      }
    } catch (_) {}

    // Seed analysis progress snapshot(s)
    try {
      if (analysisProgress && tof(analysisProgress) === 'object') {
        let seeded = false;
        if (is_array(analysisProgress.history) && analysisProgress.history.length > 0) {
          for (const entry of analysisProgress.history) {
            if (!entry || tof(entry) !== 'object') continue;
            const payload = { ...entry };
            if (!payload.runId && analysisProgress.lastRunId) payload.runId = analysisProgress.lastRunId;
            broadcast('analysis-progress', payload);
            seeded = true;
          }
        }
        if (!seeded && analysisProgress.lastPayload && tof(analysisProgress.lastPayload) === 'object') {
          broadcast('analysis-progress', { ...analysisProgress.lastPayload });
          seeded = true;
        }
        if (!seeded && analysisProgress.runs && tof(analysisProgress.runs.forEach) === 'function') {
          each(analysisProgress.runs, (runEntry, runId) => {
            if (!runEntry || tof(runEntry) !== 'object') return;
            const payload = runEntry.lastProgress;
            if (!payload || tof(payload) !== 'object') return;
            broadcast('analysis-progress', { ...payload, runId: payload.runId || runId });
          });
        }
      }
    } catch (_) {}

    // Seed terminal snapshot(s) for jobs that have already exited (client-local to avoid duplicates)
    try {
      if (jobs.size > 0) {
        for (const [id, j] of jobs.entries()) {
          if (!j || !j.lastExit) continue;
          if (jobFilter && jobFilter !== id) continue;
          const payload = { ...j.lastExit, jobId: id };
          try {
            res.write(`event: done\ndata: ${JSON.stringify(payload)}\n\n`);
            res.flush?.();
          } catch (_) {}
        }
      }
    } catch (_) {}

    const cleanup = () => {
      try { clearInterval(heartbeat); } catch (_) {}
      try { client.heartbeat && client.heartbeat.unref?.(); } catch (_) {}
      realtime.removeClient(client);
      try { if (!QUIET) console.log(`[sse] disconnect clients=${sseClients.size}`); } catch (_) {}
    };
    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('finish', cleanup);
  });

  return router;
}

module.exports = { createEventsRouter };
