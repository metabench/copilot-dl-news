'use strict';

/**
 * Domains API Routes (v1)
 * 
 * REST endpoints for domain data:
 * - GET /api/v1/domains - List crawled domains
 * - GET /api/v1/domains/:host/articles - Articles from a domain
 */

const express = require('express');

/**
 * Create domains router
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Domains router
 */
function createDomainsRouter(options = {}) {
  const { articlesAdapter, logger = console } = options;

  if (!articlesAdapter) {
    throw new Error('createDomainsRouter requires an articlesAdapter');
  }

  const router = express.Router();

  /**
   * GET /api/v1/domains
   * List all crawled domains with article counts
   * 
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 50, max: 100)
   */
  router.get('/', (req, res) => {
    try {
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 50;

      const result = articlesAdapter.listDomains({ page, limit });

      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('[domains] Error listing domains:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list domains'
      });
    }
  });

  /**
   * GET /api/v1/domains/:host/articles
   * List articles from a specific domain
   * 
   * Query params:
   * - page: Page number (default: 1)
   * - limit: Items per page (default: 20, max: 100)
   */
  router.get('/:host/articles', (req, res) => {
    try {
      const host = req.params.host;
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 20;

      if (!host) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'Domain host is required'
        });
      }

      const result = articlesAdapter.listArticlesByDomain(host, { page, limit });

      // Return empty result if no articles (domain not found)
      res.json({
        success: true,
        ...result
      });
    } catch (err) {
      logger.error('[domains] Error listing domain articles:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to list domain articles'
      });
    }
  });

  return router;
}

module.exports = {
  createDomainsRouter
};
