const express = require('express');

function createJobControlRouter({
  jobRegistry,
  broadcastProgress,
  broadcast,
  broadcastJobs,
  quiet = false
} = {}) {
  if (!jobRegistry) throw new Error('createJobControlRouter requires jobRegistry');
  if (typeof broadcastProgress !== 'function') throw new Error('createJobControlRouter requires broadcastProgress');
  if (typeof broadcast !== 'function') throw new Error('createJobControlRouter requires broadcast');
  if (typeof broadcastJobs !== 'function') throw new Error('createJobControlRouter requires broadcastJobs');

  const router = express.Router();

  router.post('/api/stop', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    const jobCount = jobRegistry.jobCount();
    if (jobCount === 0) return res.status(200).json({ stopped: false });
    if (!jobId && jobCount > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const result = jobRegistry.stopJob(jobId);
      if (!result.ok) return res.status(404).json({ error: 'Job not found' });
      try {
        if (!quiet) console.log(`[api] POST /api/stop -> 202 stop requested jobId=${jobId || result.job.id} pid=${result.job?.child?.pid || 'n/a'}`);
      } catch (_) {}
      broadcastJobs(true);
      return res.status(202).json({ stopped: true, escalatesInMs: result.escalatesInMs });
    } catch (e) {
      try {
        console.log(`[api] POST /api/stop -> 500 ${e?.message || e}`);
      } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/pause', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    const jobCount = jobRegistry.jobCount();
    if (jobCount === 0) return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
    if (!jobId && jobCount > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const result = jobRegistry.pauseJob(jobId);
      if (!result.ok) {
        const error = result.error || 'stdin unavailable';
        if (error === 'stdin-unavailable') {
          try { console.log('[api] POST /api/pause -> stdin unavailable'); } catch (_) {}
          return res.status(200).json({ ok: false, paused: false, error });
        }
        return res.status(404).json({ error: error === 'not-found' ? 'Job not found' : error });
      }
      const job = result.job;
      broadcastProgress({ ...job.metrics, stage: job.stage, paused: true }, job.id, job.metrics);
      broadcastJobs(true);
      try {
        console.log(`[api] POST /api/pause -> paused=true jobId=${job.id}`);
      } catch (_) {}
      return res.json({ ok: true, paused: true });
    } catch (e) {
      try {
        console.log(`[api] POST /api/pause -> 500 ${e?.message || e}`);
      } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  router.post('/api/resume', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    const jobCount = jobRegistry.jobCount();
    if (jobCount === 0) return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
    if (!jobId && jobCount > 1) return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
    try {
      const result = jobRegistry.resumeJob(jobId);
      if (!result.ok) {
        const error = result.error || 'stdin unavailable';
        if (error === 'stdin-unavailable') {
          try { console.log('[api] POST /api/resume -> stdin unavailable'); } catch (_) {}
          return res.status(200).json({ ok: false, paused: false, error });
        }
        return res.status(404).json({ error: error === 'not-found' ? 'Job not found' : error });
      }
      const job = result.job;
      broadcastProgress({ ...job.metrics, stage: job.stage, paused: false }, job.id, job.metrics);
      broadcastJobs(true);
      try {
        console.log(`[api] POST /api/resume -> paused=false jobId=${job.id}`);
      } catch (_) {}
      return res.json({ ok: true, paused: false });
    } catch (e) {
      try {
        console.log(`[api] POST /api/resume -> 500 ${e?.message || e}`);
      } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = {
  createJobControlRouter
};
