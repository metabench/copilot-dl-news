'use strict';

/**
 * Articles API Routes (v1)
 * 
 * REST endpoints for article data:
 * - GET /api/v1/articles - List articles with pagination
 * - GET /api/v1/articles/:id - Get single article
 * - GET /api/v1/articles/search - Full-text search
 * - GET /api/v1/articles/:id/similar - Similar articles (Content Similarity Engine)
 * - GET /api/v1/articles/:id/recommendations - Recommended articles (Hybrid scoring)
 * - GET /api/v1/articles/:id/summary - Article summary (TextRank extractive)
 * - GET /api/v1/articles/:id/sentiment - Article sentiment analysis
 */

const express = require('express');

/**
 * Create articles router
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.searchAdapter] - Search adapter for FTS
 * @param {Object} [options.duplicateDetector] - Duplicate detector for similarity
 * @param {Object} [options.recommendationEngine] - Recommendation engine for hybrid recommendations
 * @param {Object} [options.summarizer] - Summarizer for article summaries
 * @param {Object} [options.sentimentAnalyzer] - Sentiment analyzer for article sentiment
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Articles router
 */
function createArticlesRouter(options = {}) {
  const { 
    articlesAdapter, 
    searchAdapter = null, 
    duplicateDetector = null,
    recommendationEngine = null,
    summarizer = null,
    sentimentAnalyzer = null,
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

  /**
   * GET /api/v1/articles/:id/recommendations
   * Get recommended articles using hybrid scoring (content + tags + trending)
   * 
   * Query params:
   * - limit: Maximum results (default: 10, max: 50)
   * - strategy: Recommendation strategy (default: 'hybrid')
   *   - 'hybrid': Combines content similarity, tag overlap, and trending
   *   - 'content': Content-based only (SimHash similarity)
   *   - 'tag': Tag-based only (keyword/category overlap)
   *   - 'trending': Trending articles in same category
   */
  router.get('/:id/recommendations', async (req, res) => {
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

      // Check if recommendation engine is available
      if (!recommendationEngine) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Recommendation Engine not configured. Initialize with recommendationEngine.'
        });
      }

      // Parse options
      const limit = Math.min(50, Math.max(1, parseInt(req.query.limit, 10) || 10));
      const strategy = req.query.strategy || 'hybrid';
      
      // Validate strategy
      const validStrategies = ['hybrid', 'content', 'tag', 'trending'];
      if (!validStrategies.includes(strategy)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Invalid strategy. Must be one of: ${validStrategies.join(', ')}`
        });
      }

      // Get recommendations
      const result = await recommendationEngine.getRecommendations(id, {
        strategy,
        limit
      });

      // Format response according to spec
      res.json({
        success: true,
        articleId: id,
        articleTitle: article.title,
        recommendations: result.recommendations.map(rec => ({
          id: rec.contentId,
          title: rec.title,
          host: rec.host,
          url: rec.url,
          score: Math.round(rec.score * 100) / 100,
          reasons: rec.reasons
        })),
        strategy: result.strategy,
        computedAt: result.computedAt,
        cached: result.cached,
        count: result.recommendations.length,
        options: { limit, strategy }
      });
    } catch (err) {
      logger.error('[articles] Error getting recommendations:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get recommendations'
      });
    }
  });

  /**
   * GET /api/v1/articles/:id/summary
   * Get article summary using TextRank extractive summarization
   * 
   * Query params:
   * - length: Summary length (default: 'short')
   *   - 'brief': 1 sentence (~25 words)
   *   - 'short': 3 sentences (~75 words)
   *   - 'full': ~150 words (paragraph)
   *   - 'bullets': 5 key points as bullet list
   * - format: Output format (default: 'text')
   *   - 'text': Plain text summary
   *   - 'bullets': Bullet point format (same as length=bullets)
   *   - 'json': Full metadata
   * - regenerate: Force regeneration, ignore cache (default: false)
   */
  router.get('/:id/summary', async (req, res) => {
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

      // Check if summarizer is available
      if (!summarizer) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Summarization Engine not configured. Initialize with summarizer.'
        });
      }

      // Parse options
      let lengthType = req.query.length || 'short';
      const format = req.query.format || 'text';
      const regenerate = req.query.regenerate === 'true';
      
      // Validate length type
      const validLengths = ['brief', 'short', 'full', 'bullets'];
      if (!validLengths.includes(lengthType)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Invalid length. Must be one of: ${validLengths.join(', ')}`
        });
      }

      // If format is 'bullets', override length type
      if (format === 'bullets' && lengthType !== 'bullets') {
        lengthType = 'bullets';
      }

      // Generate or retrieve summary
      const result = await summarizer.summarizeArticle(id, {
        length: lengthType,
        regenerate
      });

      // Format response based on format parameter
      if (format === 'json') {
        res.json({
          success: true,
          articleId: id,
          articleTitle: article.title,
          length: result.length,
          summary: result.summary,
          sentenceCount: result.sentenceCount,
          wordCount: result.wordCount,
          method: result.method,
          cached: result.cached,
          generatedAt: result.generatedAt || result.createdAt
        });
      } else {
        // Simple text or bullets format
        res.json({
          success: true,
          articleId: id,
          length: result.length,
          summary: result.summary,
          sentenceCount: result.sentenceCount,
          wordCount: result.wordCount,
          method: result.method,
          cached: result.cached,
          generatedAt: result.generatedAt || result.createdAt
        });
      }
    } catch (err) {
      logger.error('[articles] Error getting summary:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to generate summary'
      });
    }
  });

  /**
   * GET /api/v1/articles/:id/sentiment
   * Get article sentiment analysis
   * 
   * Query params:
   * - includeEntities: Include entity-level sentiment (default: false)
   * - regenerate: Force regeneration, ignore cache (default: false)
   * - includeDetails: Include word-level details (default: false)
   */
  router.get('/:id/sentiment', async (req, res) => {
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

      // Check if sentiment analyzer is available
      if (!sentimentAnalyzer) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Sentiment Analyzer not configured. Initialize with sentimentAnalyzer.'
        });
      }

      // Parse options
      const includeEntities = req.query.includeEntities === 'true';
      const regenerate = req.query.regenerate === 'true';
      const includeDetails = req.query.includeDetails === 'true';

      // Generate or retrieve sentiment analysis
      const result = await sentimentAnalyzer.analyzeArticle(id, {
        includeEntities,
        regenerate,
        includeDetails
      });

      res.json({
        success: true,
        articleId: id,
        articleTitle: article.title,
        overallScore: result.overallScore,
        confidence: result.confidence,
        breakdown: result.breakdown,
        sentimentWordCount: result.sentimentWordCount,
        sentenceCount: result.sentenceCount,
        method: result.method,
        entitySentiments: result.entitySentiments,
        cached: result.cached,
        analyzedAt: result.analyzedAt
      });
    } catch (err) {
      logger.error('[articles] Error getting sentiment:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to analyze sentiment'
      });
    }
  });

  return router;
}

module.exports = {
  createArticlesRouter
};
