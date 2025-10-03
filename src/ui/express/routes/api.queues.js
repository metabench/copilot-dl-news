const express = require('express');
const { resolveStaleQueueJobs } = require('../services/queueJanitor');
const { listQueues, getQueueDetail } = require('../data/queues');

// Queues APIs (read-only; best-effort when DB available)
function createQueuesApiRouter({ getDbRW, jobRegistry = null, logger = null }) {
  if (typeof getDbRW !== 'function') throw new Error('createQueuesApiRouter: getDbRW function is required');
  const router = express.Router();

  router.get('/api/queues', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) return res.json({ total: 0, items: [] });
      try {
        resolveStaleQueueJobs({ db, jobRegistry, logger });
      } catch (_) {}
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
      const rows = listQueues(db, { limit });
      res.json({ total: rows.length, items: rows });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  router.get('/api/queues/:id/events', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) return res.status(400).json({ error: 'invalid id' });
    const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '200', 10)));
    const action = String(req.query.action || '').trim();
    const before = (() => { const v = parseInt(String(req.query.before||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
    const after = (() => { const v = parseInt(String(req.query.after||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
    try {
      const db = getDbRW();
      if (!db) return res.json({ job: null, items: [] });
      try {
        resolveStaleQueueJobs({ db, jobRegistry, logger });
      } catch (_) {}
      const detail = getQueueDetail(db, { id, action, before, after, limit });
      if (!detail.job) return res.status(404).json({ error: 'not found' });
      const cursors = {
        nextBefore: detail.pagination?.oldestId ?? null,
        prevAfter: detail.pagination?.newestId ?? null
      };
      res.json({
        job: detail.job,
        items: detail.events,
        cursors,
        pagination: detail.pagination,
        neighbors: detail.neighbors,
        filters: detail.filters
      });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createQueuesApiRouter };
