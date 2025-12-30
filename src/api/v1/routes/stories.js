'use strict';

/**
 * Stories API Routes (v1)
 * 
 * REST endpoints for story clusters:
 * - GET /api/v1/stories - List story clusters
 * - GET /api/v1/stories/:id - Get story details with timeline
 * 
 * @module stories
 */

const express = require('express');

/**
 * Create stories router
 * @param {Object} options - Router options
 * @param {Object} options.topicAdapter - Topic database adapter
 * @param {Object} options.articlesAdapter - Articles adapter for article details
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Stories router
 */
function createStoriesRouter(options = {}) {
  const {
    topicAdapter,
    articlesAdapter,
    logger = console
  } = options;
  
  if (!topicAdapter) {
    throw new Error('createStoriesRouter requires a topicAdapter');
  }
  
  const router = express.Router();
  
  /**
   * GET /api/v1/stories
   * List story clusters
   * 
   * Query params:
   * - active: Only active stories (default: true)
   * - limit: Max results (default: 20)
   */
  router.get('/', (req, res) => {
    try {
      const activeOnly = req.query.active !== 'false';
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      
      const clusters = topicAdapter.getStoryClusters({
        activeOnly,
        limit
      });
      
      // Format response
      const stories = clusters.map(c => {
        const articleIds = JSON.parse(c.article_ids || '[]');
        
        // Get source domains if articles adapter available
        let sources = [];
        if (articlesAdapter) {
          const domains = new Set();
          for (const id of articleIds.slice(0, 10)) {
            const article = articlesAdapter.getArticle(id);
            if (article && article.domain) {
              domains.add(article.domain);
            }
          }
          sources = Array.from(domains);
        }
        
        return {
          id: c.id,
          headline: c.headline,
          summary: c.summary,
          articleCount: c.article_count,
          sources,
          firstSeen: c.first_seen,
          lastUpdated: c.last_updated,
          isActive: c.is_active === 1,
          primaryTopicId: c.primary_topic_id
        };
      });
      
      res.json({
        success: true,
        count: stories.length,
        stories
      });
    } catch (err) {
      logger.error('[stories] Error listing stories:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list stories'
      });
    }
  });
  
  /**
   * GET /api/v1/stories/:id
   * Get story details with articles and timeline
   */
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Story ID must be a number'
        });
      }
      
      const cluster = topicAdapter.getStoryCluster(id);
      
      if (!cluster) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Story ${id} not found`
        });
      }
      
      const articleIds = JSON.parse(cluster.article_ids || '[]');
      
      // Get full article details and build timeline
      let articles = [];
      let timeline = [];
      const sources = new Set();
      
      if (articlesAdapter) {
        for (const contentId of articleIds) {
          const article = articlesAdapter.getArticle(contentId);
          if (article) {
            articles.push({
              id: contentId,
              title: article.title,
              url: article.url,
              domain: article.domain,
              publishedAt: article.published_at || article.created_at
            });
            
            if (article.domain) {
              sources.add(article.domain);
            }
            
            // Add to timeline
            timeline.push({
              date: article.published_at || article.created_at,
              articleId: contentId,
              title: article.title,
              source: article.domain
            });
          }
        }
        
        // Sort timeline by date
        timeline.sort((a, b) => new Date(a.date) - new Date(b.date));
      }
      
      // Get topic info if available
      let primaryTopic = null;
      if (cluster.primary_topic_id) {
        const topic = topicAdapter.getTopic(cluster.primary_topic_id);
        if (topic) {
          primaryTopic = {
            id: topic.id,
            name: topic.name
          };
        }
      }
      
      res.json({
        success: true,
        story: {
          id: cluster.id,
          headline: cluster.headline,
          summary: cluster.summary,
          articleCount: cluster.article_count,
          sources: Array.from(sources),
          firstSeen: cluster.first_seen,
          lastUpdated: cluster.last_updated,
          isActive: cluster.is_active === 1,
          primaryTopic
        },
        articles,
        timeline
      });
    } catch (err) {
      logger.error('[stories] Error getting story:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get story'
      });
    }
  });
  
  /**
   * GET /api/v1/stories/stats
   * Get story clustering statistics
   */
  router.get('/stats', (req, res) => {
    try {
      const stats = topicAdapter.getClusterStats();
      
      res.json({
        success: true,
        stats: {
          totalClusters: stats.total,
          activeClusters: stats.active,
          inactiveClusters: stats.total - stats.active
        }
      });
    } catch (err) {
      logger.error('[stories] Error getting stats:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get stats'
      });
    }
  });
  
  return router;
}

module.exports = { createStoriesRouter };
