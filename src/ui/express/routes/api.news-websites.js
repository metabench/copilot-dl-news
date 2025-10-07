// API routes for news websites management

const express = require('express');
const NewsWebsiteService = require('../../../services/NewsWebsiteService');
const { BadRequestError, NotFoundError, ConflictError, InternalServerError, ServiceUnavailableError } = require('../errors/HttpError');

function createNewsWebsitesRouter({ getDbRW }) {
  const router = express.Router();
  
  // Helper to get service instance
  const getService = () => {
    const db = getDbRW();
    return db ? new NewsWebsiteService(db) : null;
  };

  /**
   * GET /api/news-websites
   * List all registered news websites with cached statistics
   */
  router.get('/api/news-websites', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const websites = service.getNewsWebsitesWithStats(true);
      res.json({ websites, count: websites.length });
    } catch (error) {
      next(new InternalServerError('Failed to fetch news websites'));
    }
  });

  /**
   * GET /api/news-websites/:id
   * Get a single news website with enhanced stats (cached)
   */
  router.get('/api/news-websites/:id', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return next(new BadRequestError('Invalid website ID'));
      }

      const data = service.getNewsWebsiteEnhancedStats(id, true);
      if (!data) {
        return next(new NotFoundError('News website not found', 'news-website'));
      }

      res.json(data);
    } catch (error) {
      next(new InternalServerError('Failed to fetch news website stats'));
    }
  });

  /**
   * POST /api/news-websites
   * Add a new news website
   * 
   * Body:
   * {
   *   "url": "https://news.sky.com/",
   *   "label": "Sky News",
   *   "parent_domain": "sky.com",
   *   "website_type": "subdomain"  // or "path" or "domain"
   * }
   */
  router.post('/api/news-websites', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const { url, label, parent_domain, website_type } = req.body;

      // Validate required fields
      if (!url || !parent_domain || !website_type) {
        return next(new BadRequestError('Missing required fields: url, parent_domain, website_type'));
      }

      // Validate website_type
      if (!['subdomain', 'path', 'domain'].includes(website_type)) {
        return next(new BadRequestError('Invalid website_type. Must be: subdomain, path, or domain'));
      }

      // Validate URL format
      try {
        new URL(url);
      } catch (e) {
        return next(new BadRequestError('Invalid URL format'));
      }

      // Generate URL pattern for SQL LIKE queries
      // Examples:
      // - https://news.sky.com/ → https://news.sky.com/%
      // - https://bbc.com/news → https://bbc.com/news%
      let url_pattern = url.endsWith('/') ? url + '%' : url + '%';

      const id = service.addNewsWebsite({
        url,
        label: label || null,
        parent_domain,
        url_pattern,
        website_type,
        added_by: 'api',
        metadata: null
      });

      res.status(201).json({ 
        success: true, 
        id, 
        message: 'News website added successfully' 
      });
    } catch (error) {
      // Handle unique constraint violation
      if (error.message && error.message.includes('UNIQUE')) {
        return next(new ConflictError('This URL is already registered'));
      }
      
      next(new InternalServerError('Failed to add news website'));
    }
  });

  /**
   * DELETE /api/news-websites/:id
   * Remove a news website from the registry
   */
  router.delete('/api/news-websites/:id', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return next(new BadRequestError('Invalid website ID'));
      }

      const deleted = service.deleteNewsWebsite(id);
      if (!deleted) {
        return next(new NotFoundError('News website not found', 'news-website'));
      }

      res.json({ success: true, message: 'News website removed successfully' });
    } catch (error) {
      next(new InternalServerError('Failed to remove news website'));
    }
  });

  /**
   * PATCH /api/news-websites/:id/enabled
   * Enable or disable a news website
   * 
   * Body: { "enabled": true/false }
   */
  router.patch('/api/news-websites/:id/enabled', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return next(new BadRequestError('Invalid website ID'));
      }

      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return next(new BadRequestError('Field "enabled" must be boolean'));
      }

      const updated = service.setNewsWebsiteEnabled(id, enabled);
      if (!updated) {
        return next(new NotFoundError('News website not found', 'news-website'));
      }

      res.json({ 
        success: true, 
        message: `News website ${enabled ? 'enabled' : 'disabled'} successfully` 
      });
    } catch (error) {
      next(new InternalServerError('Failed to update news website'));
    }
  });

  /**
   * POST /api/news-websites/:id/rebuild-cache
   * Rebuild the statistics cache for a specific website
   */
  router.post('/api/news-websites/:id/rebuild-cache', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const id = parseInt(req.params.id, 10);
      if (isNaN(id)) {
        return next(new BadRequestError('Invalid website ID'));
      }

      service.rebuildCache(id);
      
      res.json({ 
        success: true, 
        message: 'Cache rebuilt successfully',
        cacheAge: 0
      });
    } catch (err) {
      next(new InternalServerError('Failed to rebuild cache: ' + err.message));
    }
  });

  /**
   * POST /api/news-websites/rebuild-all-caches
   * Rebuild statistics caches for all websites
   */
  router.post('/api/news-websites/rebuild-all-caches', (req, res, next) => {
    try {
      const service = getService();
      if (!service) {
        return next(new ServiceUnavailableError('Database not available'));
      }

      const result = service.rebuildAllCaches();
      
      res.json({ 
        success: true, 
        message: 'All caches rebuilt successfully',
        ...result
      });
    } catch (err) {
      next(new InternalServerError('Failed to rebuild caches: ' + err.message));
    }
  });

  return router;
}

module.exports = { createNewsWebsitesRouter };
