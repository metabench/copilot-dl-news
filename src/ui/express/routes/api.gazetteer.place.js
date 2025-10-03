const express = require('express');
const {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubs,
  resolvePlaces
} = require('../data/gazetteerPlace');

function createGazetteerPlaceApiRouter({ urlsDbPath }) {
  if (!urlsDbPath) {
    throw new Error('createGazetteerPlaceApiRouter requires urlsDbPath');
  }

  const router = express.Router();

  router.get('/api/gazetteer/place/:id', (req, res) => {
    const rawId = req.params.id;
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../db/sqlite'));
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const details = fetchPlaceDetails(db, rawId);
      if (!details) {
        return res.status(404).json({ error: 'Not found' });
      }

      return res.json({
        place: details.place,
        names: details.names,
        parents: details.parents,
        children: details.children,
        size_bytes: details.sizeBytes,
        size_method: details.sizeMethod
      });
    } catch (err) {
      if (err instanceof RangeError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({
        error: err && err.message ? err.message : String(err)
      });
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close failures
        }
      }
    }
  });

  router.get('/api/gazetteer/articles', (req, res) => {
    const rawId = req.query.id;
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../db/sqlite'));
    } catch (err) {
      return res.status(503).json({
        error: 'Database unavailable',
        detail: err && err.message ? err.message : String(err)
      });
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const rows = fetchPlaceArticles(db, rawId, { limit: 20 });
      return res.json(rows);
    } catch (err) {
      if (err instanceof RangeError) {
        return res.status(400).json({ error: err.message });
      }
      return res.status(500).json({
        error: err && err.message ? err.message : String(err)
      });
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close failures
        }
      }
    }
  });

  router.get('/api/gazetteer/hubs', (req, res) => {
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../db/sqlite'));
    } catch (_) {
      return res.status(200).json([]);
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const host = String(req.query.host || '').trim().toLowerCase() || null;
      const rows = listPlaceHubs(db, { host, limit: 50 });
      return res.json(rows);
    } catch (_) {
      return res.status(200).json([]);
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close failures
        }
      }
    }
  });

  router.get('/api/gazetteer/resolve', (req, res) => {
    let openDbReadOnly;
    try {
  ({ openDbReadOnly } = require('../../../db/sqlite'));
    } catch (_) {
      return res.status(200).json([]);
    }

    let db;
    try {
      db = openDbReadOnly(urlsDbPath);
      const rows = resolvePlaces(db, req.query.q, { limit: 10 });
      return res.json(rows);
    } catch (_) {
      return res.status(200).json([]);
    } finally {
      if (db && typeof db.close === 'function') {
        try {
          db.close();
        } catch (_) {
          // ignore close failures
        }
      }
    }
  });

  return router;
}

module.exports = {
  createGazetteerPlaceApiRouter
};
