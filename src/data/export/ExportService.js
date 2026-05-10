'use strict';

/**
 * ExportService - Orchestration layer for data export
 * 
 * Supports multiple formats:
 * - JSON: Standard JSON with metadata wrapper
 * - JSONL: Newline-delimited JSON for streaming
 * - CSV: Comma-separated values with proper escaping
 * - RSS 2.0: Standard RSS feed format
 * - Atom 1.0: Atom syndication format
 * 
 * Features:
 * - Streaming support for large datasets
 * - Filtering by date, host, limit
 * - Backpressure handling
 * 
 * @module ExportService
 */

const { Transform, Readable } = require('stream');
const { JsonFormatter, JsonlFormatter, createJsonlStream } = require('./formatters/JsonFormatter');
const { CsvFormatter, createCsvStream } = require('./formatters/CsvFormatter');
const { RssFormatter } = require('./formatters/RssFormatter');
const { AtomFormatter } = require('./formatters/AtomFormatter');

/**
 * Default batch size for streaming queries
 */
const DEFAULT_BATCH_SIZE = 1000;

/**
 * ExportService class
 */
class ExportService {
  /**
   * Create ExportService
   * @param {Object} options - Service options
   * @param {Object} options.articlesAdapter - Articles database adapter
   * @param {Object} [options.domainsAdapter] - Domains database adapter
   * @param {Object} [options.analyticsAdapter] - Analytics database adapter
   * @param {Object} [options.logger] - Logger instance
   * @param {Object} [options.config] - Export configuration
   */
  constructor(options = {}) {
    this.articlesAdapter = options.articlesAdapter;
    this.domainsAdapter = options.domainsAdapter || options.articlesAdapter;
    this.analyticsAdapter = options.analyticsAdapter;
    this.logger = options.logger || console;
    this.config = {
      feedTitle: options.config?.feedTitle || 'News Feed',
      feedDescription: options.config?.feedDescription || 'Exported articles from News Crawler',
      feedLink: options.config?.feedLink || 'http://localhost:4000',
      feedLanguage: options.config?.feedLanguage || 'en',
      maxFeedItems: options.config?.maxFeedItems || 50,
      ...options.config
    };

    // Initialize formatters
    this.formatters = {
      json: new JsonFormatter(),
      jsonl: new JsonlFormatter(),
      csv: new CsvFormatter(),
      rss: new RssFormatter(this.config),
      atom: new AtomFormatter(this.config)
    };
  }

  /**
   * Get supported formats
   * @returns {string[]} List of format names
   */
  getSupportedFormats() {
    return Object.keys(this.formatters);
  }

  /**
   * Get content type for a format
   * @param {string} format - Format name
   * @returns {string} Content-Type header value
   */
  getContentType(format) {
    const contentTypes = {
      json: 'application/json; charset=utf-8',
      jsonl: 'application/x-ndjson; charset=utf-8',
      csv: 'text/csv; charset=utf-8',
      rss: 'application/rss+xml; charset=utf-8',
      atom: 'application/atom+xml; charset=utf-8'
    };
    return contentTypes[format] || 'application/octet-stream';
  }

  /**
   * Export articles in specified format
   * @param {string} format - Output format (json, jsonl, csv, rss, atom)
   * @param {Object} options - Export options
   * @param {string} [options.since] - Filter articles since this date (ISO 8601)
   * @param {string} [options.until] - Filter articles until this date (ISO 8601)
   * @param {string} [options.host] - Filter by hostname
   * @param {number} [options.limit] - Maximum number of articles
   * @param {string[]} [options.fields] - Fields to include (for CSV)
   * @returns {string} Formatted export data
   */
  exportArticles(format, options = {}) {
    if (!this.articlesAdapter) {
      throw new Error('Articles adapter not configured');
    }

    const formatter = this.formatters[format];
    if (!formatter) {
      throw new Error(`Unsupported format: ${format}. Supported formats: ${this.getSupportedFormats().join(', ')}`);
    }

    // Build query options
    const queryOptions = {
      limit: options.limit || (format === 'rss' || format === 'atom' ? this.config.maxFeedItems : 1000),
      since: options.since,
      until: options.until,
      host: options.host
    };

    // Get articles from adapter
    const articles = this._queryArticles(queryOptions);

    // Format output
    return formatter.format(articles, {
      exportedAt: new Date().toISOString(),
      type: 'articles',
      query: queryOptions,
      fields: options.fields
    });
  }

  /**
   * Export domains in specified format
   * @param {string} format - Output format (json, jsonl, csv)
   * @param {Object} options - Export options
   * @param {string} [options.since] - Filter domains with articles since this date
   * @param {number} [options.limit] - Maximum number of domains
   * @returns {string} Formatted export data
   */
  exportDomains(format, options = {}) {
    if (!this.domainsAdapter) {
      throw new Error('Domains adapter not configured');
    }

    const formatter = this.formatters[format];
    if (!formatter) {
      throw new Error(`Unsupported format: ${format}`);
    }

    // Feeds don't make sense for domains
    if (format === 'rss' || format === 'atom') {
      throw new Error('RSS/Atom feeds are not supported for domains export');
    }

    // Get domains from adapter
    const domains = this._queryDomains(options);

    return formatter.format(domains, {
      exportedAt: new Date().toISOString(),
      type: 'domains',
      query: options
    });
  }

  /**
   * Export analytics data in specified format
   * @param {string} format - Output format (json, csv)
   * @param {Object} options - Export options
   * @param {string} [options.period] - Time period (7d, 30d, 90d)
   * @returns {string} Formatted export data
   */
  exportAnalytics(format, options = {}) {
    if (!this.analyticsAdapter) {
      throw new Error('Analytics adapter not configured');
    }

    const formatter = this.formatters[format];
    if (!formatter) {
      throw new Error(`Unsupported format: ${format}`);
    }

    if (format === 'rss' || format === 'atom') {
      throw new Error('RSS/Atom feeds are not supported for analytics export');
    }

    const analytics = this._queryAnalytics(options);

    return formatter.format(analytics, {
      exportedAt: new Date().toISOString(),
      type: 'analytics',
      query: options
    });
  }

  /**
   * Create a readable stream for streaming export
   * @param {string} dataType - Type of data (articles, domains)
   * @param {string} format - Output format (jsonl, csv)
   * @param {Object} options - Export options
   * @returns {Readable} Readable stream of formatted data
   */
  createExportStream(dataType, format, options = {}) {
    if (format !== 'jsonl' && format !== 'csv') {
      throw new Error('Streaming only supported for JSONL and CSV formats');
    }

    const batchSize = options.batchSize || DEFAULT_BATCH_SIZE;
    const self = this;
    let offset = 0;
    let totalExported = 0;
    const limit = options.limit || Infinity;
    let headerEmitted = false;

    // Create custom readable stream
    const stream = new Readable({
      objectMode: false,
      read() {
        // Check if we've hit the limit
        if (totalExported >= limit) {
          this.push(null);
          return;
        }

        const queryLimit = Math.min(batchSize, limit - totalExported);

        try {
          let batch;
          if (dataType === 'articles') {
            batch = self._queryArticlesBatch({
              ...options,
              limit: queryLimit,
              offset
            });
          } else if (dataType === 'domains') {
            batch = self._queryDomainsBatch({
              ...options,
              limit: queryLimit,
              offset
            });
          } else {
            throw new Error(`Unknown data type: ${dataType}`);
          }

          if (!batch || batch.length === 0) {
            this.push(null);
            return;
          }

          // Format each row
          for (const item of batch) {
            let formatted;
            if (format === 'jsonl') {
              formatted = JSON.stringify(item) + '\n';
            } else if (format === 'csv') {
              if (!headerEmitted) {
                const fields = options.fields || Object.keys(item);
                formatted = self.formatters.csv.formatHeader(fields) + '\n';
                this.push(formatted);
                headerEmitted = true;
              }
              formatted = self.formatters.csv.formatRow(item, options.fields) + '\n';
            }
            this.push(formatted);
          }

          offset += batch.length;
          totalExported += batch.length;

          // If batch is smaller than requested, we've reached the end
          if (batch.length < queryLimit) {
            this.push(null);
          }
        } catch (err) {
          this.destroy(err);
        }
      }
    });

    return stream;
  }

  /**
   * Generate RSS 2.0 feed
   * @param {Object} options - Feed options
   * @param {string} [options.host] - Filter by hostname
   * @param {number} [options.limit] - Maximum items (default: 50)
   * @returns {string} RSS 2.0 XML
   */
  generateRssFeed(options = {}) {
    return this.exportArticles('rss', {
      ...options,
      limit: options.limit || this.config.maxFeedItems
    });
  }

  /**
   * Generate Atom 1.0 feed
   * @param {Object} options - Feed options
   * @param {string} [options.host] - Filter by hostname
   * @param {number} [options.limit] - Maximum items (default: 50)
   * @returns {string} Atom 1.0 XML
   */
  generateAtomFeed(options = {}) {
    return this.exportArticles('atom', {
      ...options,
      limit: options.limit || this.config.maxFeedItems
    });
  }

  // Private methods

  /**
   * Query articles with filters
   * @private
   */
  _queryArticles(options) {
    const { limit = 1000, since, until, host, offset = 0 } = options;

    // Use adapter's method if available
    if (typeof this.articlesAdapter.exportArticles === 'function') {
      return this.articlesAdapter.exportArticles({ limit, since, until, host, offset });
    }

    // Fallback to listArticles if exportArticles not available
    if (typeof this.articlesAdapter.listArticles === 'function') {
      const result = this.articlesAdapter.listArticles({
        page: 1,
        limit,
        host,
        startDate: since,
        endDate: until
      });
      return result.items || result.articles || [];
    }

    throw new Error('Articles adapter does not support querying');
  }

  /**
   * Query articles batch for streaming
   * @private
   */
  _queryArticlesBatch(options) {
    const { limit = DEFAULT_BATCH_SIZE, offset = 0, since, until, host } = options;

    if (typeof this.articlesAdapter.exportArticlesBatch === 'function') {
      return this.articlesAdapter.exportArticlesBatch({ limit, offset, since, until, host });
    }

    // Fallback
    return this._queryArticles({ ...options, offset });
  }

  /**
   * Query domains with filters
   * @private
   */
  _queryDomains(options) {
    const { limit = 1000, since } = options;

    if (typeof this.domainsAdapter.exportDomains === 'function') {
      return this.domainsAdapter.exportDomains({ limit, since });
    }

    if (typeof this.domainsAdapter.listDomains === 'function') {
      const result = this.domainsAdapter.listDomains({ page: 1, limit });
      return result.items || result.domains || [];
    }

    throw new Error('Domains adapter does not support querying');
  }

  /**
   * Query domains batch for streaming
   * @private
   */
  _queryDomainsBatch(options) {
    const { limit = DEFAULT_BATCH_SIZE, offset = 0, since } = options;

    if (typeof this.domainsAdapter.exportDomainsBatch === 'function') {
      return this.domainsAdapter.exportDomainsBatch({ limit, offset, since });
    }

    return this._queryDomains(options);
  }

  /**
   * Query analytics data
   * @private
   */
  _queryAnalytics(options) {
    const { period = '30d' } = options;

    if (typeof this.analyticsAdapter.getAnalyticsExport === 'function') {
      return this.analyticsAdapter.getAnalyticsExport({ period });
    }

    // Build analytics from available methods
    const analytics = {
      period,
      generatedAt: new Date().toISOString()
    };

    if (typeof this.analyticsAdapter.getArticleCountsByDate === 'function') {
      analytics.dailyCounts = this.analyticsAdapter.getArticleCountsByDate(period);
    }

    if (typeof this.analyticsAdapter.getDomainLeaderboard === 'function') {
      analytics.topDomains = this.analyticsAdapter.getDomainLeaderboard(50, period);
    }

    return analytics;
  }
}

module.exports = {
  ExportService,
  DEFAULT_BATCH_SIZE
};
