const express = require('express');

// Problems APIs (read-only; best-effort when DB available)
function createProblemsApiRouter({ getDbRW }) {
  if (typeof getDbRW !== 'function') throw new Error('createProblemsApiRouter: getDbRW function is required');
  const router = express.Router();

  // GET /api/problems
  // Query: job (id), kind, scope, limit (default 100, max 500), before (id), after (id)
  // Returns newest-first by id with cursors { nextBefore, prevAfter }
  router.get('/api/problems', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) return res.json({ total: 0, items: [] });
      const limit = Math.max(1, Math.min(500, parseInt(req.query.limit || '100', 10)));
      const job = String(req.query.job || '').trim();
      const kind = String(req.query.kind || '').trim();
      const scope = String(req.query.scope || '').trim();
      const before = (() => { const v = parseInt(String(req.query.before||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();
      const after = (() => { const v = parseInt(String(req.query.after||'').trim(), 10); return Number.isFinite(v) && v > 0 ? v : null; })();

      const where = [];
      const params = [];
      if (job) { where.push('job_id = ?'); params.push(job); }
      if (kind) { where.push('kind = ?'); params.push(kind); }
      if (scope) { where.push('scope = ?'); params.push(scope); }
      let order = 'DESC';
      if (before != null) { where.push('id < ?'); params.push(before); }
      else if (after != null) { where.push('id > ?'); params.push(after); order = 'ASC'; }
      const whereSql = where.length ? ('WHERE ' + where.join(' AND ')) : '';

      let items = db.prepare(`
        SELECT id, ts, kind, scope, target, message, details, job_id AS jobId
        FROM crawl_problems
        ${whereSql}
        ORDER BY id ${order}
        LIMIT ?
      `).all(...params, limit);
      if (order === 'ASC') items.reverse();
      // Derive severity on the fly to keep table normalized
      const derive = (k) => {
        switch (k) {
          case 'missing-hub': return 'warn';
          case 'unknown-pattern': return 'info';
          default: return 'info';
        }
      };
      items = items.map(it => ({ ...it, severity: derive(it.kind) }));
      const result = { total: items.length, items };
      if (items.length) {
        result.cursors = { nextBefore: items[items.length - 1].id, prevAfter: items[0].id };
      }
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createProblemsApiRouter };
