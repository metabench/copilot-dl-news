const express = require('express');
const {
  ensureAnalysisRunSchema,
  listAnalysisRuns,
  getAnalysisRun
} = require('../services/analysisRuns');

function createAnalysisApiRouter({ getDbRW }) {
  if (typeof getDbRW !== 'function') throw new Error('createAnalysisApiRouter requires getDbRW function');
  const router = express.Router();

  router.get('/api/analysis', (req, res) => {
    try {
      const db = getDbRW();
      if (!db) {
        return res.json({ total: 0, items: [] });
      }
      ensureAnalysisRunSchema(db);
      const limit = req.query.limit != null ? req.query.limit : undefined;
      const offset = req.query.offset != null ? req.query.offset : undefined;
      const result = listAnalysisRuns(db, { limit, offset });
      res.json({ total: result.total, items: result.items });
    } catch (err) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  router.get('/api/analysis/:id', (req, res) => {
    const id = String(req.params.id || '').trim();
    if (!id) {
      return res.status(400).json({ error: 'invalid id' });
    }
    try {
      const db = getDbRW();
      if (!db) {
        return res.status(404).json({ error: 'not found' });
      }
      ensureAnalysisRunSchema(db);
      const eventsLimit = req.query.eventsLimit != null ? req.query.eventsLimit : req.query.limit;
  const run = getAnalysisRun(db, id, { limitEvents: eventsLimit });
      if (!run) {
        return res.status(404).json({ error: 'not found' });
      }
      res.json(run);
    } catch (err) {
      res.status(500).json({ error: err.message || String(err) });
    }
  });

  return router;
}

module.exports = { createAnalysisApiRouter };
