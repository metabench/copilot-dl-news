'use strict';

/**
 * Trust API Routes (v1)
 * 
 * REST endpoints for fact-checking and credibility:
 * - GET /api/v1/articles/:id/credibility - Full credibility analysis for an article
 * - GET /api/v1/sources/:host/credibility - Credibility score for a source
 * - GET /api/v1/trust/fact-checks - List/search fact-checks
 * - GET /api/v1/trust/sources - List sources with credibility ratings
 * - GET /api/v1/trust/stats - Trust system statistics
 * 
 * @module trust
 */

const express = require('express');

/**
 * Create trust router
 * @param {Object} options - Router options
 * @param {Object} options.factCheckService - FactCheckService instance
 * @param {Object} [options.articlesAdapter] - Articles adapter (for fetching article text)
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Trust router
 */
function createTrustRouter(options = {}) {
  const {
    factCheckService,
    articlesAdapter,
    logger = console
  } = options;
  
  if (!factCheckService) {
    throw new Error('createTrustRouter requires a factCheckService');
  }
  
  const router = express.Router();
  
  /**
   * GET /api/v1/articles/:id/credibility
   * Get credibility analysis for an article
   * 
   * Query params:
   * - regenerate: Force regeneration (default: false)
   * - queryApi: Query Google Fact Check API (default: false)
   */
  router.get('/articles/:id/credibility', async (req, res) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      
      if (isNaN(contentId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Article ID must be a number'
        });
      }
      
      const regenerate = req.query.regenerate === 'true';
      const queryApi = req.query.queryApi === 'true';
      
      // Get article text if we have articles adapter
      let article = null;
      if (articlesAdapter) {
        article = articlesAdapter.getArticleById 
          ? articlesAdapter.getArticleById(contentId)
          : articlesAdapter.getArticle?.(contentId);
      }
      
      if (!article) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Article ${contentId} not found`
        });
      }
      
      // Analyze article
      const result = await factCheckService.analyzeArticle({
        contentId,
        host: article.host || (article.url ? new URL(article.url).hostname : null),
        text: article.bodyText || article.body_text || article.content || '',
        title: article.title
      }, { useCache: !regenerate, queryApi });
      
      res.json({
        success: true,
        articleId: contentId,
        ...result
      });
    } catch (err) {
      logger.error('[trust] Error getting article credibility:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get article credibility'
      });
    }
  });
  
  /**
   * GET /api/v1/sources/:host/credibility
   * Get credibility score for a source
   */
  router.get('/sources/:host/credibility', (req, res) => {
    try {
      const host = req.params.host;
      
      if (!host) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_HOST',
          message: 'Host parameter is required'
        });
      }
      
      const credibility = factCheckService.getSourceCredibility(host);
      
      // Get badge for score
      const badge = credibility.credibilityScore >= 80 
        ? { emoji: '✅', label: 'High', level: 'high' }
        : credibility.credibilityScore >= 50 
          ? { emoji: '⚠️', label: 'Mixed', level: 'mixed' }
          : { emoji: '❌', label: 'Low', level: 'low' };
      
      res.json({
        success: true,
        host,
        credibilityScore: credibility.credibilityScore,
        badge,
        mbfcRating: credibility.mbfcRating,
        biasLabel: credibility.biasLabel,
        source: credibility.source || 'database',
        updatedAt: credibility.updatedAt
      });
    } catch (err) {
      logger.error('[trust] Error getting source credibility:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get source credibility'
      });
    }
  });
  
  /**
   * GET /api/v1/trust/fact-checks
   * List or search fact-checks
   * 
   * Query params:
   * - q: Search query
   * - source: Filter by fact-checker source
   * - rating: Filter by rating
   * - limit: Max results (default: 20)
   */
  router.get('/trust/fact-checks', (req, res) => {
    try {
      const { q, source, rating, limit = '20' } = req.query;
      const limitNum = parseInt(limit, 10) || 20;
      
      let factChecks;
      
      if (q) {
        factChecks = factCheckService.searchFactChecks(q, { limit: limitNum });
      } else {
        // Get all with optional filters
        const trustAdapter = factCheckService.trustAdapter;
        if (!trustAdapter) {
          return res.json({
            success: true,
            factChecks: [],
            message: 'No trust adapter configured'
          });
        }
        
        if (source) {
          factChecks = trustAdapter.getFactChecksBySource(source, { limit: limitNum });
        } else if (rating) {
          factChecks = trustAdapter.getFactChecksByRating(rating, { limit: limitNum });
        } else {
          factChecks = trustAdapter.getAllFactChecks({ limit: limitNum });
        }
      }
      
      res.json({
        success: true,
        count: factChecks.length,
        factChecks: factChecks.map(fc => ({
          id: fc.id,
          claimText: fc.claim_text?.substring(0, 200),
          rating: fc.rating,
          source: fc.source,
          sourceUrl: fc.source_url,
          publishedAt: fc.published_at
        }))
      });
    } catch (err) {
      logger.error('[trust] Error listing fact-checks:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list fact-checks'
      });
    }
  });
  
  /**
   * GET /api/v1/trust/sources
   * List sources with credibility ratings
   * 
   * Query params:
   * - minScore: Minimum credibility score (default: 0)
   * - bias: Filter by bias label
   */
  router.get('/trust/sources', (req, res) => {
    try {
      const minScore = parseInt(req.query.minScore, 10) || 0;
      const biasFilter = req.query.bias;
      
      const sources = factCheckService.getAllSources({ minScore, biasFilter });
      
      // Add badge to each source
      const sourcesWithBadges = sources.map(src => ({
        ...src,
        badge: src.credibilityScore >= 80 
          ? { emoji: '✅', label: 'High' }
          : src.credibilityScore >= 50 
            ? { emoji: '⚠️', label: 'Mixed' }
            : { emoji: '❌', label: 'Low' }
      }));
      
      res.json({
        success: true,
        count: sourcesWithBadges.length,
        sources: sourcesWithBadges
      });
    } catch (err) {
      logger.error('[trust] Error listing sources:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list sources'
      });
    }
  });
  
  /**
   * GET /api/v1/trust/stats
   * Get trust system statistics
   */
  router.get('/trust/stats', (req, res) => {
    try {
      const stats = factCheckService.getStats();
      
      res.json({
        success: true,
        stats
      });
    } catch (err) {
      logger.error('[trust] Error getting trust stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get trust stats'
      });
    }
  });
  
  /**
   * POST /api/v1/trust/fact-checks
   * Add a new fact-check record
   * 
   * Body:
   * - claimText: The claim being checked (required)
   * - rating: Rating (true, false, mostly-true, etc.) (required)
   * - source: Fact-checker name (required)
   * - sourceUrl: URL to fact-check article
   * - publishedAt: Publication date
   */
  router.post('/trust/fact-checks', (req, res) => {
    try {
      const { claimText, rating, source, sourceUrl, publishedAt } = req.body;
      
      if (!claimText || !rating || !source) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'claimText, rating, and source are required'
        });
      }
      
      const result = factCheckService.addFactCheck({
        claimText,
        rating,
        source,
        sourceUrl,
        publishedAt
      });
      
      res.status(201).json({
        success: true,
        factCheck: result
      });
    } catch (err) {
      logger.error('[trust] Error adding fact-check:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to add fact-check'
      });
    }
  });
  
  /**
   * PUT /api/v1/sources/:host/credibility
   * Update source credibility rating
   * 
   * Body:
   * - credibilityScore: Score 0-100
   * - mbfcRating: MBFC rating
   * - biasLabel: Bias label
   */
  router.put('/sources/:host/credibility', (req, res) => {
    try {
      const host = req.params.host;
      const { credibilityScore, mbfcRating, biasLabel } = req.body;
      
      if (!host) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_HOST',
          message: 'Host parameter is required'
        });
      }
      
      const result = factCheckService.updateSourceCredibility(host, {
        credibilityScore,
        mbfcRating,
        biasLabel
      });
      
      res.json({
        success: true,
        source: result
      });
    } catch (err) {
      logger.error('[trust] Error updating source credibility:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to update source credibility'
      });
    }
  });
  
  /**
   * DELETE /api/v1/articles/:id/credibility
   * Invalidate cached credibility for an article
   */
  router.delete('/articles/:id/credibility', (req, res) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      
      if (isNaN(contentId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Article ID must be a number'
        });
      }
      
      const result = factCheckService.invalidateCache(contentId);
      
      res.json({
        success: true,
        articleId: contentId,
        deleted: result.deleted
      });
    } catch (err) {
      logger.error('[trust] Error invalidating credibility cache:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to invalidate cache'
      });
    }
  });
  
  return router;
}

module.exports = { createTrustRouter };
