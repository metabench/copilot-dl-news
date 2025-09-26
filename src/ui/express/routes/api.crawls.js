const express = require('express');

// Router for crawl jobs list/detail and per-job controls
// Expects injected dependencies to preserve behavior without global coupling.
function createCrawlsApiRouter({ jobs, broadcastProgress, QUIET }) {
  if (!jobs || typeof jobs.get !== 'function') throw new Error('createCrawlsApiRouter: jobs Map required');
  const router = express.Router();

  // List ongoing crawls (single or multi-job)
  router.get('/api/crawls', (req, res) => {
    try {
      const now = Date.now();
      const items = Array.from(jobs.entries()).map(([id, j]) => {
        const m = j.metrics || {};
        const stage = j.stage || (j.child ? 'running' : 'done');
        const status = j.child ? (j.paused ? 'paused' : stage) : stage;
        return {
          id,
          pid: j.child?.pid || null,
          url: j.url || null,
          startedAt: j.startedAt || null,
          paused: !!j.paused,
          visited: m.visited || 0,
          downloaded: m.downloaded || 0,
          errors: m.errors || 0,
          queueSize: m.queueSize || 0,
          lastActivityAt: m._lastProgressWall || null,
          status,
          stage,
          stageChangedAt: j.stageChangedAt || null
        };
      });
      res.json({ count: items.length, items });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  // Job-scoped: stop
  router.post('/api/crawls/:id/stop', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const job = jobs.get(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    try {
      const target = job.child;
      if (typeof target?.kill === 'function') target.kill('SIGTERM');
      // Escalate if the process does not exit promptly
      try { if (job.killTimer) { clearTimeout(job.killTimer); job.killTimer = null; } } catch (_) {}
      job.killTimer = setTimeout(() => {
        try {
          if (target && !target.killed) {
            try { target.kill('SIGKILL'); } catch (_) {}
            if (process.platform === 'win32' && target.pid) {
              try { const { exec } = require('child_process'); exec(`taskkill /PID ${target.pid} /T /F`); } catch (_) {}
            }
          }
        } catch (_) {}
      }, 800);
      try { job.killTimer?.unref?.(); } catch (_) {}
      try { console.log(`[api] POST /api/crawls/${id}/stop -> 202 stop requested pid=${target?.pid||'n/a'}`); } catch (_) {}
      return res.status(202).json({ stopped: true, escalatesInMs: 800 });
    } catch (e) {
      try { console.log(`[api] POST /api/crawls/${id}/stop -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  // Job-scoped: pause
  router.post('/api/crawls/:id/pause', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const job = jobs.get(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    try {
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('PAUSE\n');
        job.paused = true;
  broadcastProgress({ ...job.metrics, stage: job.stage, paused: true }, job.id, job.metrics);
        try { console.log(`[api] POST /api/crawls/${id}/pause -> paused=true`); } catch (_) {}
        return res.json({ ok: true, paused: true });
      }
      try { console.log(`[api] POST /api/crawls/${id}/pause -> stdin unavailable`); } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/crawls/${id}/pause -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  // Job-scoped: resume
  router.post('/api/crawls/:id/resume', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const job = jobs.get(id);
    if (!job) return res.status(404).json({ error: 'Job not found' });
    try {
      const stdin = job.stdin || (job.child && job.child.stdin);
      if (stdin && typeof stdin.write === 'function' && !(job.child && job.child.killed)) {
        stdin.write('RESUME\n');
        job.paused = false;
  broadcastProgress({ ...job.metrics, stage: job.stage, paused: false }, job.id, job.metrics);
        try { console.log(`[api] POST /api/crawls/${id}/resume -> paused=false`); } catch (_) {}
        return res.json({ ok: true, paused: false });
      }
      try { console.log(`[api] POST /api/crawls/${id}/resume -> stdin unavailable`); } catch (_) {}
      return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
    } catch (e) {
      try { console.log(`[api] POST /api/crawls/${id}/resume -> 500 ${e?.message||e}`); } catch (_) {}
      return res.status(500).json({ error: e.message });
    }
  });

  // Per-job detail snapshot (in-memory for now)
  router.get('/api/crawls/:id', (req, res) => {
    try {
      const id = String(req.params.id || '').trim();
      if (!id) return res.status(400).json({ error: 'invalid id' });
      const j = jobs.get(id);
      if (!j) return res.status(404).json({ error: 'Job not found' });

      const m = j.metrics || {};
      const stage = j.stage || (j.child ? 'running' : 'done');
      const status = j.child ? (j.paused ? 'paused' : stage) : stage;
      const lastProgress = {
        visited: m.visited || 0,
        downloaded: m.downloaded || 0,
        found: m.found || 0,
        saved: m.saved || 0,
        errors: m.errors || 0,
        queueSize: m.queueSize || 0,
        paused: !!j.paused,
        stage
      };
      const payload = {
        id,
        pid: j.child?.pid || null,
        args: Array.isArray(j.args) ? j.args.slice() : [],
        startUrl: j.url || null,
        startedAt: j.startedAt || null,
        endedAt: (j.lastExit && j.lastExit.endedAt) ? j.lastExit.endedAt : null,
        status,
        stage,
        stageChangedAt: j.stageChangedAt || null,
        paused: !!j.paused,
        lastActivityAt: m._lastProgressWall || null,
        metrics: {
          visited: lastProgress.visited,
          downloaded: lastProgress.downloaded,
          found: lastProgress.found,
          saved: lastProgress.saved,
          errors: lastProgress.errors,
          queueSize: lastProgress.queueSize,
          requestsPerSec: m.requestsPerSec || 0,
          downloadsPerSec: m.downloadsPerSec || 0,
          errorRatePerMin: m.errorRatePerMin || 0,
          bytesPerSec: m.bytesPerSec || 0,
          stage
        },
        lastProgress
      };
      return res.json(payload);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createCrawlsApiRouter };
