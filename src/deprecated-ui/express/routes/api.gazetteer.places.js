const express = require('express');
const {
  normalizeGazetteerPlacesQuery,
  fetchGazetteerPlaces
} = require('../data/gazetteerPlaces');

function createGazetteerPlacesApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createGazetteerPlacesApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/gazetteer/places', (req, res) => {
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../db/sqlite'));
    } catch (err) {
      res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
      return;
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const normalizedQuery = normalizeGazetteerPlacesQuery(req.query || {});
      const {
        total,
        rows,
        page,
        pageSize
      } = fetchGazetteerPlaces(db, normalizedQuery);

      res.json({
        total,
        page,
        pageSize,
        rows
      });
    } catch (err) {
      res.status(500).json({
        error: err && err.message ? err.message : String(err)
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
  createGazetteerPlacesApiRouter
};
