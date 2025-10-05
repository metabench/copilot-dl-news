const express = require('express');
const {
  fetchBootstrapDbStatus,
  loadBootstrapDb,
  getBootstrapDatasetPath
} = require('../data/bootstrapDb');

function createBootstrapDbApiRouter({ getDbRW, datasetPath = null, logger = console } = {}) {
  if (typeof getDbRW !== 'function') {
    throw new Error('createBootstrapDbApiRouter requires getDbRW');
  }

  const router = express.Router();
  const resolvedDatasetPath = getBootstrapDatasetPath(datasetPath);

  router.get('/api/bootstrap-db/status', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
      return;
    }
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    try {
      const status = fetchBootstrapDbStatus(db);
      res.json({ status, datasetPath: resolvedDatasetPath });
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  router.post('/api/bootstrap-db/run', (req, res) => {
    let db;
    try {
      db = getDbRW();
    } catch (err) {
      res.status(500).json({ error: err?.message || String(err) });
      return;
    }
    if (!db) {
      res.status(503).json({ error: 'Database unavailable' });
      return;
    }
    const force = req.body?.force === true || req.body?.force === 'true';
    try {
      const summary = loadBootstrapDb({
        db,
        datasetPath: req.body?.datasetPath || resolvedDatasetPath,
        source: 'bootstrap-db@ui',
        logger,
        force
      });
      const status = fetchBootstrapDbStatus(db);
      res.json({ summary, status, forceApplied: !!force });
    } catch (err) {
      if (err && err.code === 'BOOTSTRAP_UNSAFE') {
        const status = fetchBootstrapDbStatus(db);
        res.status(409).json({ error: err.message, code: err.code, status });
        return;
      }
      res.status(500).json({ error: err?.message || String(err) });
    }
  });

  return router;
}

module.exports = {
  createBootstrapDbApiRouter
};
