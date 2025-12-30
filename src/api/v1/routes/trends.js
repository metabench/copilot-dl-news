'use strict';

/**
 * Trends API Routes (v1)
 * 
 * REST endpoints for trending topics:
 * - GET /api/v1/trends - Get trending topics
 * - GET /api/v1/trends/topics/:id/history - Topic trend history
 * - GET /api/v1/trends/emerging - Emerging new topics
 * - GET /api/v1/trends/breaking - Breaking news signals
 * 
 * @module trends
 */

const express = require('express');

/**
 * Create trends router
 * @param {Object} options - Router options
 * @param {Object} options.topicAdapter - Topic database adapter
 * @param {Object} [options.trendDetector] - TrendDetector service
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Trends router
 */
function createTrendsRouter(options = {}) {
  const {
    topicAdapter,
    trendDetector = null,
    logger = console
  } = options;
  
  if (!topicAdapter) {
    throw new Error('createTrendsRouter requires a topicAdapter');
  }
  
  const router = express.Router();
  
  /**
   * GET /api/v1/trends
   * Get trending topics
   * 
   * Query params:
   * - period: Time period (24h, 7d, 30d - default: 24h)
   * - limit: Max results (default: 20)
   */
  router.get('/', (req, res) => {
    try {
      const period = req.query.period || '24h';
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      
      let trends;
      
      if (trendDetector) {
        // Use TrendDetector for real-time trend calculation
        trends = trendDetector.detectTrends({ limit });
      } else {
        // Fall back to stored trends
        trends = topicAdapter.getLatestTrends(limit).map(t => ({
          topicId: t.topic_id,
          topicName: t.topic_name,
          score: t.trend_score,
          currentCount: t.article_count,
          change: 0,
          percentChange: 0,
          isTrending: t.trend_score >= 2.0
        }));
      }
      
      // Filter to only trending topics
      const trendingOnly = trends.filter(t => t.isTrending || t.score > 0);
      
      res.json({
        success: true,
        period,
        count: trendingOnly.length,
        trends: trendingOnly.map(t => ({
          topicId: t.topicId,
          name: t.topicName,
          trendScore: t.score,
          change: t.change,
          percentChange: t.percentChange,
          currentCount: t.currentCount,
          baseline: t.baseline,
          isTrending: t.isTrending
        }))
      });
    } catch (err) {
      logger.error('[trends] Error getting trends:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get trends'
      });
    }
  });
  
  /**
   * GET /api/v1/trends/topics/:id/history
   * Get trend history for a topic
   * 
   * Query params:
   * - days: Number of days (default: 30)
   */
  router.get('/topics/:id/history', (req, res) => {
    try {
      const topicId = parseInt(req.params.id, 10);
      const days = Math.min(parseInt(req.query.days, 10) || 30, 365);
      
      if (isNaN(topicId)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Topic ID must be a number'
        });
      }
      
      // Verify topic exists
      const topic = topicAdapter.getTopic(topicId);
      if (!topic) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Topic ${topicId} not found`
        });
      }
      
      let history;
      
      if (trendDetector) {
        history = trendDetector.getTopicHistory(topicId, { days });
      } else {
        // Calculate date range manually
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - days);
        
        history = topicAdapter.getTopicTrends({
          topicId,
          startDate: startDate.toISOString().split('T')[0],
          endDate: endDate.toISOString().split('T')[0]
        });
      }
      
      res.json({
        success: true,
        topic: {
          id: topic.id,
          name: topic.name
        },
        days,
        history: history.map(h => ({
          date: h.date,
          articleCount: h.article_count || h.articleCount,
          trendScore: h.trend_score || h.trendScore
        }))
      });
    } catch (err) {
      logger.error('[trends] Error getting topic history:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get topic history'
      });
    }
  });
  
  /**
   * GET /api/v1/trends/emerging
   * Get emerging new topics
   * 
   * Query params:
   * - days: Days to look back for "new" (default: 3)
   * - limit: Max results (default: 10)
   */
  router.get('/emerging', (req, res) => {
    try {
      const days = Math.min(parseInt(req.query.days, 10) || 3, 30);
      const limit = Math.min(parseInt(req.query.limit, 10) || 10, 50);
      
      let emerging;
      
      if (trendDetector) {
        emerging = trendDetector.getEmergingTopics({ days, limit });
      } else {
        // Fall back to recent topics from adapter
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() - days);
        
        emerging = topicAdapter.getRecentTopics({
          sinceDate: cutoffDate.toISOString(),
          minArticles: 3
        }).slice(0, limit).map(t => ({
          topicId: t.id,
          topicName: t.name,
          articleCount: t.article_count,
          createdAt: t.created_at,
          isNew: true
        }));
      }
      
      res.json({
        success: true,
        days,
        count: emerging.length,
        emerging
      });
    } catch (err) {
      logger.error('[trends] Error getting emerging topics:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get emerging topics'
      });
    }
  });
  
  /**
   * GET /api/v1/trends/breaking
   * Detect potential breaking news (high velocity topics)
   * 
   * Query params:
   * - hours: Hours to look back (default: 6)
   * - minArticles: Min articles to consider (default: 5)
   */
  router.get('/breaking', (req, res) => {
    try {
      const hours = Math.min(parseInt(req.query.hours, 10) || 6, 48);
      const minArticles = parseInt(req.query.minArticles, 10) || 5;
      
      let breaking;
      
      if (trendDetector) {
        breaking = trendDetector.detectBreakingNews({ hours, minArticles });
      } else {
        // Fall back to topics with recent activity
        breaking = topicAdapter.getTopicsWithRecentActivity({
          hours,
          minArticles
        }).map(t => ({
          topicId: t.id,
          topicName: t.name,
          recentCount: t.recent_count,
          velocity: Math.round((t.recent_count / hours) * 100) / 100,
          isBreaking: (t.recent_count / hours) >= 1
        })).filter(t => t.isBreaking);
      }
      
      res.json({
        success: true,
        hours,
        count: breaking.length,
        breaking
      });
    } catch (err) {
      logger.error('[trends] Error detecting breaking news:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to detect breaking news'
      });
    }
  });
  
  return router;
}

module.exports = { createTrendsRouter };
