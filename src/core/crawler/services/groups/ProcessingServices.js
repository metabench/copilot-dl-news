'use strict';

/**
 * ProcessingServices - Content fetching and processing services.
 *
 * Groups:
 * - fetchPipeline: URL fetching pipeline
 * - linkExtractor: Link extraction from HTML
 * - articleProcessor: Article content processing
 * - processing (facade): Unified processing interface
 *
 * @param {ServiceContainer} container - The service container
 * @param {Object} config - Crawler configuration
 */
function registerProcessingServices(container, config) {
  // Link extractor
  container.register('linkExtractor', (c) => {
    try {
      const LinkExtractor = require('../../LinkExtractor');
      return new LinkExtractor({
        baseUrl: config.startUrl,
        followExternal: config.followExternal || false
      });
    } catch (e) {
      // Provide minimal shim if LinkExtractor doesn't exist
      return {
        extract(html, baseUrl) {
          const links = [];
          const regex = /href=["']([^"']+)["']/gi;
          let match;
          while ((match = regex.exec(html)) !== null) {
            try {
              const url = new URL(match[1], baseUrl).href;
              links.push({ url });
            } catch (err) {
              // Invalid URL, skip
            }
          }
          return links;
        }
      };
    }
  }, { group: 'processing' });

  // Article processor
  container.register('articleProcessor', (c) => {
    try {
      const ArticleProcessor = require('../../ArticleProcessor');
      return new ArticleProcessor({
        context: c.get('context'),
        config
      });
    } catch (e) {
      // Provide minimal shim
      return {
        process(url, html, metadata = {}) {
          const context = c.get('context');
          context.recordArticle(url, metadata);
          return {
            url,
            processed: true,
            timestamp: Date.now()
          };
        },
        isArticle(url, html) {
          // Basic heuristic
          return html && html.length > 1000 && /<article/i.test(html);
        }
      };
    }
  }, { group: 'processing', dependencies: ['context'] });

  // Fetch pipeline
  container.register('fetchPipeline', (c) => {
    try {
      const FetchPipeline = require('../../FetchPipeline');
      return new FetchPipeline({
        context: c.get('context'),
        retryCoordinator: c.tryGet('retryCoordinator'),
        urlDecisionOrchestrator: c.tryGet('urlDecisionOrchestrator'),
        config: {
          timeout: config.timeout || 30000,
          maxRetries: config.maxRetries || 3,
          userAgent: config.userAgent || 'NewsCrawlerBot/1.0'
        }
      });
    } catch (e) {
      // FetchPipeline should exist, throw if it doesn't
      throw new Error(`FetchPipeline not available: ${e.message}`);
    }
  }, { group: 'processing', dependencies: ['context', 'retryCoordinator', 'urlDecisionOrchestrator'] });

  // HTML parser (optional, for structured extraction)
  container.register('htmlParser', (c) => {
    try {
      const cheerio = require('cheerio');
      return {
        parse(html) {
          return cheerio.load(html);
        }
      };
    } catch (e) {
      // cheerio not available, provide basic parser
      return {
        parse(html) {
          return {
            text: () => html.replace(/<[^>]+>/g, ' ').trim(),
            find: () => ({ length: 0 })
          };
        }
      };
    }
  }, { group: 'processing' });

  // Processing facade
  container.register('processing', (c) => {
    const context = c.get('context');
    const fetchPipeline = c.get('fetchPipeline');
    const linkExtractor = c.get('linkExtractor');
    const articleProcessor = c.get('articleProcessor');

    return {
      fetch: fetchPipeline,
      links: linkExtractor,
      articles: articleProcessor,

      /**
       * Fetch and process a URL.
       * @param {string} url
       * @param {Object} options
       * @returns {Promise<Object>}
       */
      async fetchAndProcess(url, options = {}) {
        // Fetch
        const fetchResult = await fetchPipeline.fetch(url, options);
        if (!fetchResult.success) {
          return { url, success: false, reason: fetchResult.reason };
        }

        const html = fetchResult.content;

        // Extract links
        const links = linkExtractor.extract(html, url);

        // Check if article
        let article = null;
        if (articleProcessor.isArticle(url, html)) {
          article = articleProcessor.process(url, html, options.metadata);
        }

        return {
          url,
          success: true,
          links,
          article,
          contentLength: html.length,
          fetchTime: fetchResult.elapsedMs
        };
      },

      /**
       * Extract links from HTML content.
       * @param {string} html
       * @param {string} baseUrl
       * @returns {Array}
       */
      extractLinks(html, baseUrl) {
        return linkExtractor.extract(html, baseUrl);
      },

      /**
       * Process content as article.
       * @param {string} url
       * @param {string} html
       * @param {Object} metadata
       * @returns {Object}
       */
      processArticle(url, html, metadata = {}) {
        return articleProcessor.process(url, html, metadata);
      }
    };
  }, { group: 'facades', dependencies: ['fetchPipeline', 'linkExtractor', 'articleProcessor', 'context'] });
}

module.exports = { registerProcessingServices };
