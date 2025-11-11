'use strict';

const express = require('express');

function defaultLogger(logger) {
  if (logger && typeof logger.error === 'function') {
    return logger;
  }
  return console;
}

function createErrorPayload(code, message) {
  return {
    error: code,
    message,
    timestamp: new Date().toISOString()
  };
}

function toJobSummary(job) {
  const metrics = job?.metrics || {};
  const stage = job?.stage || (job?.child ? 'running' : 'done');
  const status = job?.child ? (job?.paused ? 'paused' : stage) : stage;

  return {
    id: job?.id || null,
    pid: job?.child?.pid || null,
    url: job?.url || null,
    startedAt: job?.startedAt || null,
    paused: !!job?.paused,
    visited: metrics.visited || 0,
    downloaded: metrics.downloaded || 0,
    errors: metrics.errors || 0,
    queueSize: metrics.queueSize || 0,
    lastActivityAt: metrics._lastProgressWall || null,
    status,
    stage,
    stageChangedAt: job?.stageChangedAt || null
  };
}

function buildJobDetail(job) {
  if (!job) {
    return null;
  }

  const metrics = job.metrics || {};
  const stage = job.stage || (job.child ? 'running' : 'done');
  const status = job.child ? (job.paused ? 'paused' : stage) : stage;

  return {
    id: job.id,
    pid: job.child?.pid || null,
    args: Array.isArray(job.args) ? job.args.slice() : [],
    startUrl: job.url || null,
    startedAt: job.startedAt || null,
    endedAt: job.lastExit && job.lastExit.endedAt ? job.lastExit.endedAt : null,
    status,
    stage,
    stageChangedAt: job.stageChangedAt || null,
    paused: !!job.paused,
    lastActivityAt: metrics._lastProgressWall || null,
    metrics: {
      visited: metrics.visited || 0,
      downloaded: metrics.downloaded || 0,
      found: metrics.found || 0,
      saved: metrics.saved || 0,
      errors: metrics.errors || 0,
      queueSize: metrics.queueSize || 0,
      requestsPerSec: metrics.requestsPerSec || 0,
      downloadsPerSec: metrics.downloadsPerSec || 0,
      errorRatePerMin: metrics.errorRatePerMin || 0,
      bytesPerSec: metrics.bytesPerSec || 0,
      stage
    },
    lastProgress: {
      visited: metrics.visited || 0,
      downloaded: metrics.downloaded || 0,
      found: metrics.found || 0,
      saved: metrics.saved || 0,
      errors: metrics.errors || 0,
      queueSize: metrics.queueSize || 0,
      paused: !!job.paused,
      stage
    }
  };
}

function createCrawlsRouter({
  jobRegistry,
  broadcastProgress,
  broadcastJobs,
  logger,
  quiet = false
} = {}) {
  const router = express.Router();
  const log = defaultLogger(logger);

  function ensureRegistry(res) {
    if (jobRegistry && typeof jobRegistry.getJobs === 'function') {
      return jobRegistry;
    }

    res.status(503).json(createErrorPayload('JOB_REGISTRY_UNAVAILABLE', 'Job registry is not available. Configure the API server with a JobRegistry instance.'));
    return null;
  }

  function normalizeId(raw, res) {
    const id = String(raw || '').trim();
    if (!id) {
      res.status(400).json(createErrorPayload('INVALID_JOB_ID', 'Crawl job id is required.'));
      return null;
    }
    return id;
  }

  function emitProgress(job) {
    if (typeof broadcastProgress === 'function' && job) {
      try {
        broadcastProgress({ ...job.metrics, stage: job.stage, paused: job.paused }, job.id, job.metrics);
      } catch (error) {
        if (!quiet) {
          log.error('Failed to broadcast progress update:', error);
        }
      }
    }
  }

  function emitJobsSnapshot(force = false) {
    if (typeof broadcastJobs === 'function') {
      try {
        broadcastJobs(force);
      } catch (error) {
        if (!quiet) {
          log.error('Failed to broadcast job snapshot:', error);
        }
      }
    }
  }

  router.get('/', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    try {
      const jobs = registry.getJobs();
      const items = Array.from(jobs.entries()).map(([, job]) => toJobSummary(job));
      res.json({ count: items.length, items });
    } catch (error) {
      log.error('Failed to enumerate crawl jobs:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to list crawl jobs.'));
    }
  });

  router.get('/:id', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    const id = normalizeId(req.params.id, res);
    if (!id) {
      return;
    }

    try {
      const job = registry.getJob ? registry.getJob(id) : registry.getJobs().get(id);
      if (!job) {
        return res.status(404).json(createErrorPayload('JOB_NOT_FOUND', 'Crawl job not found.'));
      }

      const detail = buildJobDetail(job);
      res.json(detail);
    } catch (error) {
      log.error('Failed to load crawl job detail:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to load crawl job detail.'));
    }
  });

  router.delete('/:id', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    const id = normalizeId(req.params.id, res);
    if (!id) {
      return;
    }

    try {
      const job = registry.getJob ? registry.getJob(id) : registry.getJobs().get(id);
      if (!job) {
        return res.status(404).json(createErrorPayload('JOB_NOT_FOUND', 'Crawl job not found.'));
      }

      registry.stopJob(id);
      registry.removeJob(id);
      emitJobsSnapshot(true);

      res.json({ success: true, message: 'Crawl job cleared.' });
    } catch (error) {
      log.error('Failed to delete crawl job:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to delete crawl job.'));
    }
  });

  router.post('/:id/stop', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    const id = normalizeId(req.params.id, res);
    if (!id) {
      return;
    }

    try {
      const result = registry.stopJob(id);
      if (!result || result.ok === false) {
        return res.status(404).json(createErrorPayload('JOB_NOT_FOUND', 'Crawl job not found.'));
      }

      emitJobsSnapshot(true);

      res.status(202).json({
        stopped: true,
        escalatesInMs: result.escalatesInMs || 800
      });
    } catch (error) {
      log.error('Failed to stop crawl job:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to stop crawl job.'));
    }
  });

  router.post('/:id/pause', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    const id = normalizeId(req.params.id, res);
    if (!id) {
      return;
    }

    try {
      const result = registry.pauseJob(id);
      if (!result || result.ok === false) {
        if (result && result.error === 'stdin-unavailable') {
          return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
        }
        return res.status(404).json(createErrorPayload('JOB_NOT_FOUND', 'Crawl job not found.'));
      }

      emitProgress(result.job);
      emitJobsSnapshot(true);

      res.json({ ok: true, paused: true });
    } catch (error) {
      log.error('Failed to pause crawl job:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to pause crawl job.'));
    }
  });

  router.post('/:id/resume', (req, res) => {
    const registry = ensureRegistry(res);
    if (!registry) {
      return;
    }

    const id = normalizeId(req.params.id, res);
    if (!id) {
      return;
    }

    try {
      const result = registry.resumeJob(id);
      if (!result || result.ok === false) {
        if (result && result.error === 'stdin-unavailable') {
          return res.status(200).json({ ok: false, paused: false, error: 'stdin unavailable' });
        }
        return res.status(404).json(createErrorPayload('JOB_NOT_FOUND', 'Crawl job not found.'));
      }

      emitProgress(result.job);
      emitJobsSnapshot(true);

      res.json({ ok: true, paused: false });
    } catch (error) {
      log.error('Failed to resume crawl job:', error);
      res.status(500).json(createErrorPayload('INTERNAL_ERROR', error.message || 'Failed to resume crawl job.'));
    }
  });

  return router;
}

module.exports = {
  createCrawlsRouter
};
