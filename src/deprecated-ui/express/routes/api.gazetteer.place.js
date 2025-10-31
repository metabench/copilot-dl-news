const express = require('express');
const {
  fetchPlaceDetails,
  fetchPlaceArticles,
  listPlaceHubs,
  resolvePlaces
} = require('../data/gazetteerPlace');

let cachedArticlePlaceMatcher;
function getArticlePlaceMatcher() {
  if (cachedArticlePlaceMatcher !== undefined) {
    return cachedArticlePlaceMatcher;
  }
  try {
    const mod = require('../../../matching/ArticlePlaceMatcher');
    cachedArticlePlaceMatcher = mod?.ArticlePlaceMatcher || mod || null;
  } catch (_) {
    cachedArticlePlaceMatcher = null;
  }
  return cachedArticlePlaceMatcher;
}

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

  router.get('/api/gazetteer/articles', async (req, res) => {
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
      let responseSystem = 'legacy_fallback';
      let responseArticles = null;

      try {
        const ArticlePlaceMatcher = getArticlePlaceMatcher();
        if (ArticlePlaceMatcher) {
          const matcher = new ArticlePlaceMatcher({ db });
          const matcherFn = (() => {
            if (matcher && typeof matcher.getArticleMatches === 'function') {
              return () => matcher.getArticleMatches(rawId, minConfidence, ruleLevel);
            }
            if (matcher && typeof matcher.getMatchesForPlace === 'function') {
              return () => matcher.getMatchesForPlace(rawId, { minConfidence, ruleLevel });
            }
            return null;
          })();

          if (matcherFn) {
            const rawMatches = await Promise.resolve(matcherFn());
            if (Array.isArray(rawMatches) && rawMatches.length > 0) {
              responseSystem = 'new_matching';
              responseArticles = rawMatches.map((match) => ({
                url: match.url || (match.content_id ? `content://${match.content_id}` : null),
                title: match.title || 'Unknown Article',
                placeId: match.place_id ?? null,
                placeName: match.place_name ?? null,
                publishedAt: match.published_at ?? null,
                confidence: match.confidence_score ?? match.confidence ?? null,
                matchingRuleLevel: match.matching_rule_level ?? null,
                matchMethod: match.match_method ?? null,
                evidence: match.evidence ?? null
              }));
            }
          }
        }
      } catch (_) {
        // New matching system is optional; fallback handles absence or errors
      }

      if (responseSystem === 'new_matching' && Array.isArray(responseArticles)) {
        return res.json({
          articles: responseArticles,
          total: responseArticles.length,
          system: responseSystem
        });
      }

      const rows = fetchPlaceArticles(db, rawId, { limit: 20 });
      return res.json({
        articles: rows,
        total: rows.length,
        system: responseSystem
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
