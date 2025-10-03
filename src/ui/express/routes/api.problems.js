const express = require('express');
const { fetchProblems } = require('../data/problems');

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
      const { items, cursors } = fetchProblems(db, {
        job: req.query.job,
        kind: req.query.kind,
        scope: req.query.scope,
        before: req.query.before,
        after: req.query.after,
        limit: req.query.limit
      });

      // Derive severity on the fly to keep table normalized
      const derive = (k) => {
        switch (k) {
          case 'missing-hub': return 'warn';
          case 'unknown-pattern': return 'info';
          default: return 'info';
        }
      };
      const decoratedItems = items.map((it) => ({ ...it, severity: derive(it.kind) }));
      const result = { total: decoratedItems.length, items: decoratedItems };
      if (decoratedItems.length && cursors && Object.keys(cursors).length) {
        result.cursors = cursors;
      }
      return res.json(result);
    } catch (e) {
      return res.status(500).json({ error: e.message });
    }
  });

  return router;
}

module.exports = { createProblemsApiRouter };
