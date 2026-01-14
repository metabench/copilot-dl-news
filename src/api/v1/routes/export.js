'use strict';

/**
 * Export API Routes (v1)
 * 
 * REST endpoints for data export:
 * - GET /api/v1/export/articles - Export articles in various formats
 * - GET /api/v1/export/domains - Export domains in various formats
 * - GET /api/v1/export/analytics - Export analytics data
 * - GET /api/v1/feed/rss - RSS 2.0 feed
 * - GET /api/v1/feed/atom - Atom 1.0 feed
 * 
 * @module exportRoutes
 */

const express = require('express');
const { ExportService } = require('../../../data/export/ExportService');

/**
 * Create export router
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.domainsAdapter] - Domains database adapter
 * @param {Object} [options.analyticsAdapter] - Analytics database adapter
 * @param {Object} [options.exportConfig] - Export configuration
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Export router
 */
function createExportRouter(options = {}) {
  const {
    articlesAdapter,
    domainsAdapter,
    analyticsAdapter,
    exportConfig = {},
    logger = console
  } = options;

  // Create export service
  let exportService = null;
  try {
    exportService = new ExportService({
      articlesAdapter,
      domainsAdapter: domainsAdapter || articlesAdapter,
      analyticsAdapter,
      config: exportConfig,
      logger
    });
  } catch (err) {
    logger.error('[export] Failed to create ExportService:', err);
  }

  const router = express.Router();

  /**
   * GET /api/v1/export/articles
   * Export articles in specified format
   * 
   * Query params:
   * - format: Output format (json, jsonl, csv, rss, atom) (default: json)
   * - since: Start date (ISO 8601)
   * - until: End date (ISO 8601)
   * - host: Filter by hostname
   * - limit: Maximum articles (default: 1000, max: 100000)
   * - stream: Use streaming mode (for jsonl/csv)
   * - fields: Comma-separated fields for CSV
   */
  router.get('/articles', (req, res) => {
    try {
      if (!exportService) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Export service not available'
        });
      }

      const format = req.query.format || 'json';
      const validFormats = exportService.getSupportedFormats();

      if (!validFormats.includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Invalid format. Supported: ${validFormats.join(', ')}`
        });
      }

      // Parse options
      const options = {
        since: req.query.since || null,
        until: req.query.until || null,
        host: req.query.host || null,
        limit: Math.min(100000, Math.max(1, parseInt(req.query.limit, 10) || 1000)),
        fields: req.query.fields ? req.query.fields.split(',').map(f => f.trim()) : null
      };

      // Streaming mode
      if (req.query.stream === 'true' && (format === 'jsonl' || format === 'csv')) {
        res.setHeader('Content-Type', exportService.getContentType(format));
        res.setHeader('Content-Disposition', `attachment; filename="articles.${format}"`);

        const stream = exportService.createExportStream('articles', format, options);
        stream.pipe(res);
        stream.on('error', (err) => {
          logger.error('[export] Stream error:', err);
          if (!res.headersSent) {
            res.status(500).json({ error: 'Stream error' });
          }
        });
        return;
      }

      // Normal export
      const data = exportService.exportArticles(format, options);

      res.setHeader('Content-Type', exportService.getContentType(format));
      if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="articles.${format}"`);
      }

      res.send(data);

    } catch (err) {
      logger.error('[export] Error exporting articles:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to export articles'
      });
    }
  });

  /**
   * GET /api/v1/export/domains
   * Export domains in specified format
   * 
   * Query params:
   * - format: Output format (json, jsonl, csv) (default: json)
   * - since: Filter domains with articles since this date
   * - limit: Maximum domains (default: 1000)
   */
  router.get('/domains', (req, res) => {
    try {
      if (!exportService) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Export service not available'
        });
      }

      const format = req.query.format || 'json';

      if (format === 'rss' || format === 'atom') {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: 'RSS/Atom feeds not supported for domain export. Use json, jsonl, or csv.'
        });
      }

      const validFormats = ['json', 'jsonl', 'csv'];
      if (!validFormats.includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Invalid format. Supported: ${validFormats.join(', ')}`
        });
      }

      const options = {
        since: req.query.since || null,
        limit: Math.min(10000, Math.max(1, parseInt(req.query.limit, 10) || 1000))
      };

      const data = exportService.exportDomains(format, options);

      res.setHeader('Content-Type', exportService.getContentType(format));
      if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="domains.${format}"`);
      }

      res.send(data);

    } catch (err) {
      logger.error('[export] Error exporting domains:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to export domains'
      });
    }
  });

  /**
   * GET /api/v1/export/analytics
   * Export analytics data
   * 
   * Query params:
   * - format: Output format (json, csv) (default: json)
   * - period: Time period (7d, 30d, 90d) (default: 30d)
   */
  router.get('/analytics', (req, res) => {
    try {
      if (!exportService) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Export service not available'
        });
      }

      if (!analyticsAdapter) {
        return res.status(501).json({
          success: false,
          error: 'NOT_IMPLEMENTED',
          message: 'Analytics export not configured'
        });
      }

      const format = req.query.format || 'json';
      const validFormats = ['json', 'csv'];

      if (!validFormats.includes(format)) {
        return res.status(400).json({
          success: false,
          error: 'BAD_REQUEST',
          message: `Invalid format. Supported: ${validFormats.join(', ')}`
        });
      }

      const options = {
        period: req.query.period || '30d'
      };

      const data = exportService.exportAnalytics(format, options);

      res.setHeader('Content-Type', exportService.getContentType(format));
      if (req.query.download === 'true') {
        res.setHeader('Content-Disposition', `attachment; filename="analytics.${format}"`);
      }

      res.send(data);

    } catch (err) {
      logger.error('[export] Error exporting analytics:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to export analytics'
      });
    }
  });

  return router;
}

/**
 * Create feed router for RSS and Atom feeds
 * @param {Object} options - Router options
 * @param {Object} options.articlesAdapter - Articles database adapter
 * @param {Object} [options.exportConfig] - Export configuration
 * @param {Object} [options.logger] - Logger instance
 * @returns {express.Router} Feed router
 */
function createFeedRouter(options = {}) {
  const {
    articlesAdapter,
    exportConfig = {},
    logger = console
  } = options;

  let exportService = null;
  try {
    exportService = new ExportService({
      articlesAdapter,
      config: exportConfig,
      logger
    });
  } catch (err) {
    logger.error('[feed] Failed to create ExportService:', err);
  }

  const router = express.Router();

  /**
   * GET /api/v1/feed/rss
   * RSS 2.0 feed of latest articles
   * 
   * Query params:
   * - host: Filter by hostname
   * - limit: Maximum items (default: 50, max: 100)
   */
  router.get('/rss', (req, res) => {
    try {
      if (!exportService) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Feed service not available'
        });
      }

      const options = {
        host: req.query.host || null,
        limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
      };

      const rss = exportService.generateRssFeed(options);

      res.setHeader('Content-Type', 'application/rss+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minute cache
      res.send(rss);

    } catch (err) {
      logger.error('[feed] Error generating RSS feed:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to generate RSS feed'
      });
    }
  });

  /**
   * GET /api/v1/feed/atom
   * Atom 1.0 feed of latest articles
   * 
   * Query params:
   * - host: Filter by hostname
   * - limit: Maximum items (default: 50, max: 100)
   */
  router.get('/atom', (req, res) => {
    try {
      if (!exportService) {
        return res.status(503).json({
          success: false,
          error: 'SERVICE_UNAVAILABLE',
          message: 'Feed service not available'
        });
      }

      const options = {
        host: req.query.host || null,
        limit: Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50))
      };

      const atom = exportService.generateAtomFeed(options);

      res.setHeader('Content-Type', 'application/atom+xml; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=300'); // 5 minute cache
      res.send(atom);

    } catch (err) {
      logger.error('[feed] Error generating Atom feed:', err);
      res.status(500).json({
        success: false,
        error: 'INTERNAL_ERROR',
        message: 'Failed to generate Atom feed'
      });
    }
  });

  return router;
}

module.exports = {
  createExportRouter,
  createFeedRouter
};
