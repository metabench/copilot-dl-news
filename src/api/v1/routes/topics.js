'use strict';

/**
 * Topics API Routes (v1)
 * 
 * REST endpoints for topic modeling and story clustering:
 * - GET /api/v1/topics - List all topics
 * - GET /api/v1/topics/:id - Get topic details
 * - GET /api/v1/topics/:id/articles - Articles for a topic
 * 
 * @module topics
 */

const express = require('express');

/**
 * Create topics router
 * @param {Object} options - Router options
 * @param {Object} options.topicAdapter - Topic database adapter
 * @param {Object} options.articlesAdapter - Articles adapter for article details
 * @param {Object} [options.topicModeler] - TopicModeler service
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Topics router
 */
function createTopicsRouter(options = {}) {
  const {
    topicAdapter,
    articlesAdapter,
    topicModeler = null,
    logger = console
  } = options;
  
  if (!topicAdapter) {
    throw new Error('createTopicsRouter requires a topicAdapter');
  }
  
  const router = express.Router();
  
  /**
   * GET /api/v1/topics
   * List all topics with article counts
   * 
   * Query params:
   * - includeSeed: Include seed topics (default: true)
   * - minArticles: Minimum article count filter
   */
  router.get('/', (req, res) => {
    try {
      const includeSeed = req.query.includeSeed !== 'false';
      const minArticles = parseInt(req.query.minArticles, 10) || 0;
      
      let topics = topicAdapter.getAllTopics({ includeSeed });
      
      // Filter by minimum articles
      if (minArticles > 0) {
        topics = topics.filter(t => t.article_count >= minArticles);
      }
      
      // Format response
      const formatted = topics.map(t => ({
        id: t.id,
        name: t.name,
        keywords: JSON.parse(t.keywords || '[]'),
        articleCount: t.article_count,
        isSeed: t.is_seed === 1,
        createdAt: t.created_at,
        updatedAt: t.updated_at
      }));
      
      res.json({
        success: true,
        count: formatted.length,
        topics: formatted
      });
    } catch (err) {
      logger.error('[topics] Error listing topics:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list topics'
      });
    }
  });
  
  /**
   * GET /api/v1/topics/:id
   * Get topic details
   */
  router.get('/:id', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Topic ID must be a number'
        });
      }
      
      const topic = topicAdapter.getTopic(id);
      
      if (!topic) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Topic ${id} not found`
        });
      }
      
      res.json({
        success: true,
        topic: {
          id: topic.id,
          name: topic.name,
          keywords: JSON.parse(topic.keywords || '[]'),
          articleCount: topic.article_count,
          isSeed: topic.is_seed === 1,
          createdAt: topic.created_at,
          updatedAt: topic.updated_at
        }
      });
    } catch (err) {
      logger.error('[topics] Error getting topic:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get topic'
      });
    }
  });
  
  /**
   * GET /api/v1/topics/:id/articles
   * Get articles for a topic
   * 
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   */
  router.get('/:id/articles', (req, res) => {
    try {
      const id = parseInt(req.params.id, 10);
      const page = parseInt(req.query.page, 10) || 1;
      const limit = Math.min(parseInt(req.query.limit, 10) || 20, 100);
      const offset = (page - 1) * limit;
      
      if (isNaN(id)) {
        return res.status(400).json({
          success: false,
          error: 'INVALID_ID',
          message: 'Topic ID must be a number'
        });
      }
      
      // Verify topic exists
      const topic = topicAdapter.getTopic(id);
      if (!topic) {
        return res.status(404).json({
          success: false,
          error: 'NOT_FOUND',
          message: `Topic ${id} not found`
        });
      }
      
      // Get articles for topic
      const articleTopics = topicAdapter.getTopicArticles({
        topicId: id,
        limit,
        offset
      });
      
      const total = topicAdapter.countTopicArticles(id);
      
      // Enrich with article details if adapter available
      let articles = articleTopics;
      if (articlesAdapter) {
        articles = articleTopics.map(at => {
          const article = articlesAdapter.getArticle(at.content_id);
          return {
            contentId: at.content_id,
            probability: at.probability,
            assignedAt: at.assigned_at,
            title: article ? article.title : null,
            url: article ? article.url : null,
            publishedAt: article ? article.published_at : null
          };
        });
      }
      
      res.json({
        success: true,
        topic: {
          id: topic.id,
          name: topic.name
        },
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit)
        },
        articles
      });
    } catch (err) {
      logger.error('[topics] Error getting topic articles:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to get topic articles'
      });
    }
  });
  
  /**
   * POST /api/v1/topics/classify
   * Classify text into topics (for testing/debugging)
   * 
   * Body:
   * - text: Text to classify
   * - maxTopics: Max topics to return (default: 3)
   */
  router.post('/classify', (req, res) => {
    try {
      if (!topicModeler) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'TopicModeler not configured'
        });
      }
      
      const { text, maxTopics = 3 } = req.body;
      
      if (!text) {
        return res.status(400).json({
          success: false,
          error: 'MISSING_TEXT',
          message: 'Text is required'
        });
      }
      
      const topics = topicModeler.classify(text, { maxTopics });
      
      res.json({
        success: true,
        textLength: text.length,
        topicsFound: topics.length,
        topics
      });
    } catch (err) {
      logger.error('[topics] Error classifying text:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to classify text'
      });
    }
  });
  
  return router;
}

module.exports = { createTopicsRouter };
