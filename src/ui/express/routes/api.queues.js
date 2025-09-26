const express = require('express');

// Queues APIs (read-only; best-effort when DB available)
function createQueuesApiRouter({ getDbRW }) {
  if (typeof getDbRW !== 'function') throw new Error('createQueuesApiRouter: getDbRW function is required');
  const router = express.Router();

  router.get('/api/queues', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) return res.json({ total: 0, items: [] });
      const limit = Math.max(1, Math.min(200, parseInt(req.query.limit || '50', 10)));
      const rows = db.prepare(`
        SELECT j.id, j.url, j.pid, j.started_at AS startedAt, j.ended_at AS endedAt, j.status,
               (SELECT COUNT(*) FROM queue_events e WHERE e.job_id = j.id) AS events,
               (SELECT MAX(ts) FROM queue_events e WHERE e.job_id = j.id) AS lastEventAt
        FROM crawl_jobs j
        ORDER BY COALESCE(j.ended_at, j.started_at) DESC
        LIMIT ?
      `).all(limit);
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
      const job = db.prepare(`SELECT id, url, pid, started_at AS startedAt, ended_at AS endedAt, status FROM crawl_jobs WHERE id = ?`).get(id);
      if (!job) return res.status(404).json({ error: 'not found' });
      const where = ['job_id = ?'];
      const params = [id];
      if (action) { where.push('action = ?'); params.push(action); }
      let order = 'DESC';
      if (before != null) { where.push('id < ?'); params.push(before); }
      else if (after != null) { where.push('id > ?'); params.push(after); order = 'ASC'; }
      let items = db.prepare(`
        SELECT id, ts, action, url, depth, host, reason, queue_size AS queueSize
        FROM queue_events
        WHERE ${where.join(' AND ')}
        ORDER BY id ${order}
        LIMIT ?
      `).all(...params, limit);
      if (order === 'ASC') items.reverse();
      const nextCursor = items.length ? items[items.length - 1].id : null; // for older pages (before=nextCursor)
      const prevCursor = items.length ? items[0].id : null; // for newer pages (after=prevCursor)
      res.json({ job, items, cursors: { nextBefore: nextCursor, prevAfter: prevCursor } });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createQueuesApiRouter };
