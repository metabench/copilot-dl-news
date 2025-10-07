const express = require('express');
const { JobControlService } = require('../services/control/JobControlService');

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
  
  // Initialize JobControlService
  const jobControl = new JobControlService({ jobRegistry });

  router.post('/api/stop', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    
    const result = jobControl.stopJob({ jobId });
    
    if (!result.ok) {
      if (result.error === 'not-running') {
        return res.status(200).json({ stopped: false });
      }
      if (result.error === 'ambiguous') {
        return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
      }
      return res.status(404).json({ error: 'Job not found' });
    }
    
    try {
      if (!quiet) {
        console.log(`[api] POST /api/stop -> 202 stop requested jobId=${jobId || result.job.id} pid=${result.job?.child?.pid || 'n/a'}`);
      }
    } catch (_) {}
    
    broadcastJobs(true);
    return res.status(202).json({ stopped: true, escalatesInMs: result.escalatesInMs });
  });

  router.post('/api/pause', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    
    const result = jobControl.pauseJob({ jobId });
    
    if (!result.ok) {
      if (result.error === 'not-running') {
        return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
      }
      if (result.error === 'ambiguous') {
        return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
      }
      if (result.error === 'stdin-unavailable') {
        try { console.log('[api] POST /api/pause -> stdin unavailable'); } catch (_) {}
        return res.status(200).json({ ok: false, paused: false, error: result.error });
      }
      return res.status(404).json({ error: result.error === 'not-found' ? 'Job not found' : result.error });
    }
    
    const job = result.job;
    broadcastProgress({ ...job.metrics, stage: job.stage, paused: true }, job.id, job.metrics);
    broadcastJobs(true);
    
    try {
      console.log(`[api] POST /api/pause -> paused=true jobId=${job.id}`);
    } catch (_) {}
    
    return res.json({ ok: true, paused: true });
  });

  router.post('/api/resume', (req, res) => {
    const jobId = String(req.body?.jobId || req.query?.jobId || '').trim() || null;
    
    const result = jobControl.resumeJob({ jobId });
    
    if (!result.ok) {
      if (result.error === 'not-running') {
        return res.status(200).json({ ok: false, paused: false, error: 'not-running' });
      }
      if (result.error === 'ambiguous') {
        return res.status(400).json({ error: 'Multiple jobs running; specify jobId' });
      }
      if (result.error === 'stdin-unavailable') {
        try { console.log('[api] POST /api/resume -> stdin unavailable'); } catch (_) {}
        return res.status(200).json({ ok: false, paused: false, error: result.error });
      }
      return res.status(404).json({ error: result.error === 'not-found' ? 'Job not found' : result.error });
    }
    
    const job = result.job;
    broadcastProgress({ ...job.metrics, stage: job.stage, paused: false }, job.id, job.metrics);
    broadcastJobs(true);
    
    try {
      console.log(`[api] POST /api/resume -> paused=false jobId=${job.id}`);
    } catch (_) {}
    
    return res.json({ ok: true, paused: false });
  });

  return router;
}

module.exports = {
  createJobControlRouter
};
