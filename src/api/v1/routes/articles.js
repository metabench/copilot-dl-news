'use strict';

/**
 * Articles API Routes (v1)
 * 
 * REST endpoints for article data:
 * - GET /api/v1/articles - List articles with pagination
 * - GET /api/v1/articles/:id - Get single article
 * - GET /api/v1/articles/search - Full-text search
 * - GET /api/v1/articles/:id/similar - Similar articles (Content Similarity Engine)
 */

const express = require('express');

/**
 * Create articles router
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.searchAdapter] - Search adapter for FTS
 * @param {Object} [options.duplicateDetector] - Duplicate detector for similarity
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Articles router
 */
function createArticlesRouter(options = {}) {
  const { 
    articlesAdapter, 
    searchAdapter = null, 
    duplicateDetector = null,
    logger = console 
  } = options;

  if (!articlesAdapter) {
    throw new Error('createArticlesRouter requires an articlesAdapter');
  }

  const router = express.Router();

  /**
   * GET /api/v1/articles
   * List articles with pagination
   * 
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   */
  router.get('/', (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;

      const result = articlesAdapter.listArticles({ page, limit });

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('[articles] Error listing articles:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list articles'
      });
    }
  });

  /**
   * GET /api/v1/articles/search
   * Full-text search across articles
   * 
   * Query params:
   * - q: Search query (required)
   * - page: Page number (default: 1)
   * - limit: Results per page (default: 20)
   * - domain: Filter by domain
   * - startDate: Filter from date (YYYY-MM-DD)
   * - endDate: Filter to date (YYYY-MM-DD)
   */
  router.get('/search', (req, res) => {
    try {
      const query = req.query.q;

      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Search query (q) is required'
        });
      }

      // Check if search adapter is available
      if (!searchAdapter) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Full-text search is not configured. See Phase 8 Item 1 (Article Full-Text Search).'
        });
      }

      const limit = Math.min(100, parseInt(req.query.limit, 10) || 20);
      const offset = (Math.max(1, parseInt(req.query.page, 10) || 1) - 1) * limit;
      const domain = req.query.domain || null;
      const startDate = req.query.startDate || null;
      const endDate = req.query.endDate || null;

      const result = searchAdapter.search(query, {
        limit,
        offset,
        domain,
        startDate,
        endDate
      });

      res.json({
        success: true,
        query,
        ...result
      });
    } catch (err) {
      logger.error('[articles] Error searching:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Search failed'
      });
    }
  });

  /**
   * GET /api/v1/articles/:id
   * Get single article by ID
   */
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);

      if (!id || isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Invalid article ID'
        });
      }

      const article = articlesAdapter.getArticleById(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Article ${id} not found`
        });
      }

      res.json({
        success: true,
        article
      });
    } catch (err) {
      logger.error('[articles] Error getting article:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get article'
      });
    }
  });

  /**
   * GET /api/v1/articles/:id/similar
   * Get similar articles using Content Similarity Engine (SimHash + MinHash + LSH)
   * 
   * Query params:
   * - limit: Maximum results (default: 10, max: 50)
   * - minSimilarity: Minimum similarity threshold 0-1 (default: 0.5)
   */
  router.get('/:id/similar', async (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);

      if (!id || isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Invalid article ID'
        });
      }

      // Verify article exists
      const article = articlesAdapter.getArticleById(id);

      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Article ${id} not found`
        });
      }

      // Check if similarity engine is available
      if (!duplicateDetector) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Content Similarity Engine not configured. Initialize with duplicateDetector.'
        });
      }

      // Parse options
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const minSimilarity = Math.min(1, Math.max(0, parseFloat(req.query.minSimilarity) || 0.5));

      // Find similar articles
      const similar = await duplicateDetector.findSimilarWithMetadata(id, {
        limit,
        minSimilarity
      });

      res.json({
        success: true,
        articleId: id,
        articleTitle: article.title,
        similar,
        count: similar.length,
        options: { limit, minSimilarity }
      });
    } catch (err) {
      logger.error('[articles] Error getting similar articles:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get similar articles'
      });
    }
  });

  return router;
}

module.exports = {
  createArticlesRouter
};
