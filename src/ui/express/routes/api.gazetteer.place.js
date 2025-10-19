const express = require('express');
const {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubs,
  resolvePlaces
} = require('../data/gazetteerPlace');
const ArticlePlaceMatcher = require('../../../matching/ArticlePlaceMatcher');

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
    const minConfidence = parseFloat(req.query.minConfidence || '0.3');
    const ruleLevel = parseInt(req.query.ruleLevel || '1');

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

      // Try new matching system first
      const matcher = new ArticlePlaceMatcher(db);
      const matches = matcher.getArticleMatches(rawId, minConfidence);

      if (matches && matches.length > 0) {
        // Return matches from new system
        return res.json({
          articles: matches.map(match => ({
            url: `content://${match.content_id}`, // Placeholder URL for content ID
            title: match.title || 'Unknown Article',
            placeId: match.place_id,
            placeName: match.place_name,
            publishedAt: null, // Not available in current schema
            confidence: match.confidence_score,
            matchingRuleLevel: match.matching_rule_level,
            matchMethod: match.match_method,
            evidence: match.evidence
          })),
          total: matches.length,
          system: 'new_matching'
        });
      }

      // Fallback to old system (will return empty array)
      const rows = fetchPlaceArticles(db, rawId, { limit: 20 });
      return res.json({
        articles: rows,
        total: rows.length,
        system: 'legacy_fallback'
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
