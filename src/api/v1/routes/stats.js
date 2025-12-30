'use strict';

/**
 * Stats API Routes (v1)
 * 
 * REST endpoints for statistics:
 * - GET /api/v1/stats - Overall statistics
 * - GET /api/v1/stats/daily - Daily crawl counts
 */

const express = require('express');

/**
 * Create stats router
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Stats router
 */
function createStatsRouter(options = {}) {
  const { articlesAdapter, logger = console } = options;

  if (!articlesAdapter) {
    throw new Error('createStatsRouter requires an articlesAdapter');
  }

  const router = express.Router();

  /**
   * GET /api/v1/stats
   * Get overall statistics
   */
  router.get('/', (req, res) => {
    try {
      const stats = articlesAdapter.getStats();

      res.json({
        success: true,
        stats
      });
    } catch (err) {
      logger.error('[stats] Error getting stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get statistics'
      });
    }
  });

  /**
   * GET /api/v1/stats/daily
   * Get daily crawl counts
   * 
   * Query params:
   * - days: Number of days to look back (default: 30, max: 365)
   */
  router.get('/daily', (req, res) => {
    try {
      const days = parseInt(req.query.days, 10) || 30;
      const dailyCounts = articlesAdapter.getDailyCrawlCounts(days);

      res.json({
        success: true,
        days,
        items: dailyCounts
      });
    } catch (err) {
      logger.error('[stats] Error getting daily stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get daily statistics'
      });
    }
  });

  return router;
}

module.exports = {
  createStatsRouter
};
