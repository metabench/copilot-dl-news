/**
 * Articles API Routes
 *
 * Provides endpoints for article-place matching operations.
 */

const express = require('express');
const { ArticlePlaceMatcher } = require('../../../matching/ArticlePlaceMatcher');

function createArticlesApiRouter({ getDbRW }) {
  if (typeof getDbRW !== 'function') throw new Error('createArticlesApiRouter requires getDbRW function');
  const router = express.Router();

/**
 * GET /api/articles/:id/places
 * Get places associated with an article
 */
router.get('/:id/places', async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const minConfidence = parseFloat(req.query.minConfidence) || 0.0;

    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }

    const db = req.app.locals.db;
    const relations = db.prepare(`
      SELECT
        apr.*,
        p.kind as place_kind,
        p.canonical_name_id,
        pn.name as place_name,
        p.country_code,
        p.region_code
      FROM article_place_relations apr
      JOIN places p ON apr.place_id = p.id
      LEFT JOIN place_names pn ON p.canonical_name_id = pn.id
      WHERE apr.article_id = ? AND apr.confidence >= ?
      ORDER BY apr.confidence DESC, apr.created_at DESC
    `).all(articleId, minConfidence);

    // Parse evidence JSON for each relation
    const enrichedRelations = relations.map(relation => ({
      ...relation,
      evidence: JSON.parse(relation.evidence || '{}')
    }));

    res.json({
      articleId,
      relations: enrichedRelations,
      count: enrichedRelations.length
    });

  } catch (error) {
    console.error('Error fetching article places:', error);
    res.status(500).json({ error: 'Failed to fetch article places' });
  }
});

/**
 * GET /api/places/:id/articles
 * Get articles associated with a place
 */
router.get('/places/:id/articles', async (req, res) => {
  try {
    const placeId = parseInt(req.params.id);
    const minConfidence = parseFloat(req.query.minConfidence) || 0.0;
    const limit = parseInt(req.query.limit) || 50;
    const offset = parseInt(req.query.offset) || 0;

    if (isNaN(placeId)) {
      return res.status(400).json({ error: 'Invalid place ID' });
    }

    const db = req.app.locals.db;
    const relations = db.prepare(`
      SELECT
        apr.*,
        a.title as article_title,
        a.url as article_url,
        a.published_at,
        a.source_name,
        a.language
      FROM article_place_relations apr
      JOIN articles a ON apr.article_id = a.id
      WHERE apr.place_id = ? AND apr.confidence >= ?
      ORDER BY apr.confidence DESC, a.published_at DESC
      LIMIT ? OFFSET ?
    `).all(placeId, minConfidence, limit, offset);

    // Parse evidence JSON for each relation
    const enrichedRelations = relations.map(relation => ({
      ...relation,
      evidence: JSON.parse(relation.evidence || '{}')
    }));

    // Get total count for pagination
    const totalCount = db.prepare(`
      SELECT COUNT(*) as count
      FROM article_place_relations
      WHERE place_id = ? AND confidence >= ?
    `).get(placeId, minConfidence).count;

    res.json({
      placeId,
      relations: enrichedRelations,
      count: enrichedRelations.length,
      totalCount,
      limit,
      offset,
      hasMore: offset + limit < totalCount
    });

  } catch (error) {
    console.error('Error fetching place articles:', error);
    res.status(500).json({ error: 'Failed to fetch place articles' });
  }
});

/**
 * POST /api/articles/:id/match-places
 * Trigger place matching for an article
 */
router.post('/:id/match-places', async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);
    const ruleLevel = parseInt(req.body.ruleLevel) || 1;
    const force = req.body.force === true;

    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }

    if (ruleLevel < 1 || ruleLevel > 4) {
      return res.status(400).json({ error: 'Rule level must be between 1 and 4' });
    }

    const db = req.app.locals.db;

    // Check if article exists (using normalized schema)
    const article = db.prepare('SELECT id FROM http_responses WHERE id = ?').get(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Check if matching already exists (unless force is true)
    if (!force) {
      const existing = db.prepare(`
        SELECT id FROM article_place_relations
        WHERE article_id = ? AND matching_rule_level >= ?
      `).get(articleId, ruleLevel);

      if (existing) {
        return res.status(409).json({
          error: 'Article already has place matches at this or higher rule level',
          existingMatchId: existing.id
        });
      }
    }

    // Remove existing matches if force is true
    if (force) {
      db.prepare('DELETE FROM article_place_relations WHERE article_id = ?').run(articleId);
    }

    // Perform matching
    const matcher = getMatcher(db);
    const relations = await matcher.matchArticleToPlaces(articleId, ruleLevel);

    // Store relations in database
    const storedRelations = [];
    for (const relation of relations) {
      try {
        const result = db.prepare(`
          INSERT INTO article_place_relations (
            article_id, place_id, relation_type, confidence,
            matching_rule_level, evidence
          ) VALUES (?, ?, ?, ?, ?, ?)
        `).run(
          relation.article_id,
          relation.place_id,
          relation.relation_type,
          relation.confidence,
          relation.matching_rule_level,
          relation.evidence
        );

        storedRelations.push({
          id: result.lastInsertRowid,
          ...relation
        });
      } catch (error) {
        console.warn(`Failed to store relation for article ${articleId}, place ${relation.place_id}:`, error);
      }
    }

    res.json({
      articleId,
      ruleLevel,
      relations: storedRelations,
      count: storedRelations.length,
      message: `Matched ${storedRelations.length} places to article`
    });

  } catch (error) {
    console.error('Error matching article places:', error);
    res.status(500).json({ error: 'Failed to match article places' });
  }
});

/**
 * DELETE /api/articles/:id/places
 * Remove all place associations for an article
 */
router.delete('/:id/places', async (req, res) => {
  try {
    const articleId = parseInt(req.params.id);

    if (isNaN(articleId)) {
      return res.status(400).json({ error: 'Invalid article ID' });
    }

    const db = req.app.locals.db;

    // Check if article exists (using normalized schema)
    const article = db.prepare('SELECT id FROM http_responses WHERE id = ?').get(articleId);
    if (!article) {
      return res.status(404).json({ error: 'Article not found' });
    }

    // Delete relations
    const result = db.prepare('DELETE FROM article_place_relations WHERE article_id = ?').run(articleId);

    res.json({
      articleId,
      deletedCount: result.changes,
      message: `Removed ${result.changes} place associations`
    });

  } catch (error) {
    console.error('Error removing article places:', error);
    res.status(500).json({ error: 'Failed to remove article places' });
  }
});

  return router;
}

module.exports = { createArticlesApiRouter };