'use strict';

/**
 * Coverage API Routes (v1)
 * 
 * REST endpoints for multi-source aggregation coverage:
 * - GET /api/v1/stories/:id/coverage - Full coverage analysis for a story
 * - GET /api/v1/articles/:id/story - Which story does this article belong to
 * 
 * These routes extend the existing stories API with aggregation features.
 * 
 * @module coverage
 */

const express = require('express');

/**
 * Create coverage router
 * @param {Object} options - Router options
 * @param {Object} options.coverageMap - CoverageMap instance
 * @param {Object} [options.coverageAdapter] - Coverage database adapter (for caching)
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Coverage router
 */
function createCoverageRouter(options = {}) {
  const {
    coverageMap,
    coverageAdapter,
    logger = console
  } = options;
  
  if (!coverageMap) {
    throw new Error('createCoverageRouter requires a coverageMap');
  }
  
  const router = express.Router();
  
  /**
   * GET /api/v1/stories/:id/coverage
   * Get full coverage analysis for a story
   * 
   * Returns:
   * - Story metadata (headline, article count, sources)
   * - Source breakdown with tone analysis
   * - Timeline of coverage
   * - Perspective analysis (consensus, divergence)
   * - Fact comparison (shared facts, conflicts)
   */
  router.get('/stories/:id/coverage', async (req, res) => {
    try {
      const storyId = parseInt(req.params.id, 10);
      
      if (isNaN(storyId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Story ID must be a number'
        });
      }
      
      // Check for cached coverage in adapter
      let cachedCoverage = null;
      if (coverageAdapter) {
        const entries = coverageAdapter.getStoryCoverage(storyId);
        if (entries.length > 0) {
          // Return cached summary if recent (within 1 hour)
          const newest = entries.reduce((max, e) => 
            new Date(e.analyzedAt) > new Date(max.analyzedAt) ? e : max
          );
          const age = Date.now() - new Date(newest.analyzedAt).getTime();
          if (age < 3600000) { // 1 hour
            cachedCoverage = entries;
          }
        }
      }
      
      // Generate fresh coverage analysis
      const coverage = await coverageMap.getFullCoverageAnalysis(storyId);
      
      if (!coverage) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Story ${storyId} not found`
        });
      }
      
      // Cache the coverage if adapter available
      if (coverageAdapter && coverage.perspectives) {
        for (const p of (coverage.perspectives.perspectives || [])) {
          try {
            coverageAdapter.saveCoverage({
              storyId,
              contentId: p.articleId,
              host: p.host,
              tone: p.tone,
              toneScore: p.toneScore,
              toneConfidence: p.toneConfidence,
              focusKeywords: p.focusKeywords,
              prominentEntities: p.prominentEntities
            });
          } catch (err) {
            logger.error(`[coverage] Failed to cache coverage for article ${p.articleId}:`, err.message);
          }
        }
      }
      
      res.json({
        success: true,
        storyId,
        headline: coverage.headline,
        articleCount: coverage.articleCount,
        sourceCount: coverage.sourceCount,
        firstSeen: coverage.firstSeen,
        lastUpdated: coverage.lastUpdated,
        sources: coverage.sources,
        timeline: coverage.timeline,
        perspectives: coverage.perspectives,
        factComparison: coverage.factComparison,
        generatedAt: coverage.generatedAt
      });
    } catch (err) {
      logger.error('[coverage] Error getting story coverage:', err);
      
      if (err.message && err.message.includes('not found')) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: err.message
        });
      }
      
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get story coverage'
      });
    }
  });
  
  /**
   * GET /api/v1/articles/:id/story
   * Get which story an article belongs to
   * 
   * Returns:
   * - Story ID and headline if matched
   * - null if article is not in any story cluster
   */
  router.get('/articles/:id/story', (req, res) => {
    try {
      const contentId = parseInt(req.params.id, 10);
      
      if (isNaN(contentId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Article ID must be a number'
        });
      }
      
      const story = coverageMap.getArticleStory(contentId);
      
      if (!story) {
        return res.json({
          success: true,
          articleId: contentId,
          story: null,
          message: 'Article is not part of any story cluster'
        });
      }
      
      res.json({
        success: true,
        articleId: contentId,
        story: {
          id: story.storyId,
          headline: story.headline,
          articleCount: story.articleCount,
          firstSeen: story.firstSeen,
          lastUpdated: story.lastUpdated
        }
      });
    } catch (err) {
      logger.error('[coverage] Error getting article story:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get article story'
      });
    }
  });
  
  /**
   * GET /api/v1/coverage/stats
   * Get coverage statistics across all stories
   */
  router.get('/coverage/stats', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 20;
      const stats = await coverageMap.getCoverageStats({ limit });
      
      // Add adapter stats if available
      let adapterStats = null;
      if (coverageAdapter) {
        adapterStats = coverageAdapter.getStats();
      }
      
      res.json({
        success: true,
        stats,
        adapterStats
      });
    } catch (err) {
      logger.error('[coverage] Error getting coverage stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get coverage stats'
      });
    }
  });
  
  return router;
}

module.exports = { createCoverageRouter };
