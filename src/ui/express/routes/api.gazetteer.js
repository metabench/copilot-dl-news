const express = require('express');

function createGazetteerApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createGazetteerApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/gazetteer/summary', (req, res) => {
    let openDbReadOnly;
    try {
      ({ openDbReadOnly } = require('../../../ensure_db'));
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const getCount = (sql) => {
        try {
          const row = db.prepare(sql).get();
          return (row && typeof row.c === 'number') ? row.c : 0;
        } catch (_) {
          return 0;
        }
      };

      const countries = getCount("SELECT COUNT(*) AS c FROM places WHERE kind='country'");
      const regions = getCount("SELECT COUNT(*) AS c FROM places WHERE kind='region'");
      const cities = getCount("SELECT COUNT(*) AS c FROM places WHERE kind='city'");
      const names = getCount('SELECT COUNT(*) AS c FROM place_names');
      const sources = getCount('SELECT COUNT(*) AS c FROM place_sources');

      res.json({
        countries,
        regions,
        cities,
        names,
        sources
      });
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
