const express = require('express');
const { fetchGazetteerSummary } = require('../../../data/gazetteerSummary');

function createGazetteerApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createGazetteerApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/gazetteer/summary', (req, res) => {
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../data/db/sqlite'));
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
  const counts = fetchGazetteerSummary(db);

  res.json(counts);
    } catch (err) {
      res.status(500).json({
        error: 'Failed to load gazetteer summary',
        detail: err && err.message ? err.message : String(err)
      });
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close errors
        }
      }
    }
  });

  return router;
}

module.exports = {
  createGazetteerApiRouter
};
