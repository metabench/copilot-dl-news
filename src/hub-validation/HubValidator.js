/**
 * HubValidator - Comprehensive hub validation facade
 *
 * This module provides comprehensive validation for identifying whether
 * articles are actually place hubs or topic hubs, using multiple data sources
 * and verification strategies.
 *
 * Now acts as a facade that delegates to specialized modules:
 * - HubCacheManager: Article caching and retrieval
 * - HubNormalizer: URL normalization and HTML processing
 * - HubValidationEngine: Core validation logic for all hub types
 * - HubContentAnalyzer: Content analysis and metrics building
 */

const { HubCacheManager } = require('./HubCacheManager');
const { HubNormalizer } = require('./HubNormalizer');
const { HubValidationEngine } = require('./HubValidationEngine');
const { HubContentAnalyzer } = require('./HubContentAnalyzer');

class HubValidator {
  constructor(db) {
    this.db = db;
    this.cacheManager = new HubCacheManager(db);
    this.normalizer = new HubNormalizer();
    this.validationEngine = new HubValidationEngine(db);
    this.contentAnalyzer = new HubContentAnalyzer();
    this.updateStmt = null;
    this.initialized = false;
  }

  /**
   * Initialize validation data and prepare statements
   */
  initialize() {
    if (this.initialized) return;
    this.validationEngine.initialize();
    this.initialized = true;
  }

  /**
   * Normalize a hub URL to its front page (remove pagination, query params)
   * @param {string} url - Original URL
   * @returns {string} - Normalized URL
   */
  normalizeHubUrl(url) {
    return this.normalizer.normalizeHubUrl(url);
  }

  /**
   * Check if we have a cached version of the URL
   * @param {string} url - URL to check
   * @returns {Object|null} - Article record or null
   */
  getCachedArticle(url) {
    return this.cacheManager.getCachedArticle(url);
  }

  /**
   * Validate that a URL is actually a hub page by checking content
   * @param {string} url - URL to validate
   * @param {string} placeName - Expected place name
   * @returns {Promise<Object>} - { isValid: boolean, reason: string }
   */
  async validateHubContent(url, placeName, overrides = {}) {
    const providedHtml = overrides.html ? this.normalizer.bufferToString(overrides.html) : null;
    const providedTitle = overrides.title || overrides.pageTitle || null;
    const providedMetrics = overrides.metrics || {};
    let article = null;
    let htmlSource = overrides.htmlSource || (providedHtml ? 'provided-html' : null);

    if (providedHtml) {
      article = {
        url,
        title: providedTitle || this.normalizer.extractTitle(providedHtml),
        html: providedHtml,
        text: overrides.text || this.normalizer.extractText(providedHtml),
        wordCount: providedMetrics.wordCount,
        navLinksCount: providedMetrics.navLinksCount,
        articleLinksCount: providedMetrics.articleLinksCount,
        source: overrides.source || 'provided'
      };
    } else {
      article = this.getCachedArticle(url);
      htmlSource = htmlSource || (article ? article.source : null);
    }

    if (article) {
      return this.contentAnalyzer.analyzeHubContent(article, placeName, { htmlSource });
    }

    try {
      const https = require('https');
      const http = require('http');

      return await new Promise((resolve) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;

        const requestOptions = {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
          },
          timeout: 10000
        };

        const req = protocol.get(url, requestOptions, (res) => {
          if (res.statusCode !== 200) {
            resolve({
              isValid: false,
              reason: `HTTP ${res.statusCode} response`
            });
            return;
          }

          let data = '';
          res.on('data', chunk => { data += chunk; });
          res.on('end', () => {
            const fetchedArticle = {
              url,
              title: this.normalizer.extractTitle(data),
              html: data,
              text: this.normalizer.extractText(data),
              source: 'network-fetch'
            };
            resolve(this.contentAnalyzer.analyzeHubContent(fetchedArticle, placeName, { htmlSource: 'network-fetch' }));
          });
        });

        req.on('error', (error) => {
          resolve({
            isValid: false,
            reason: `Fetch error: ${error.message}`
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({
            isValid: false,
            reason: 'Request timeout'
          });
        });
      });
    } catch (error) {
      return {
        isValid: false,
        reason: `Validation error: ${error.message}`
      };
    }
  }

  /**
   * Analyze article content to verify it's a hub page
   */
  analyzeHubContent(article, placeName, options = {}) {
    return this.contentAnalyzer.analyzeHubContent(article, placeName, options);
  }

  /**
   * Validate if a title/URL combination represents a place hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, placeName: string|null }
   */
  validatePlaceHub(title, url) {
    this.initialize();
    return this.validationEngine.validatePlaceHub(title, url);
  }

  /**
   * Validate if a title/URL combination represents a topic hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, topicName: string|null }
   */
  validateTopicHub(title, url) {
    this.initialize();
    return this.validationEngine.validateTopicHub(title, url);
  }

  /**
   * Validate if a title/URL combination represents a place-topic combination hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @param {Object} expected - Expected place and topic
   * @param {string} expected.place - Expected place name
   * @param {string} expected.topic - Expected topic slug
   * @returns {Object} - { isValid: boolean, reason: string, placeName: string|null, topicName: string|null }
   */
  validatePlaceTopicHub(title, url, expected = {}) {
    this.initialize();
    return this.validationEngine.validatePlaceTopicHub(title, url, expected);
  }

  /**
   * Validate if a title/URL combination represents a place-place hierarchical hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @param {Object} expected - Expected parent and child places
   * @param {string} expected.parent - Expected parent place name
   * @param {string} expected.child - Expected child place name
   * @returns {Object} - { isValid: boolean, reason: string, parentName: string|null, childName: string|null }
   */
  validatePlacePlaceHub(title, url, expected = {}) {
    this.initialize();
    return this.validationEngine.validatePlacePlaceHub(title, url, expected);
  }

  /**
   * Extract title from HTML
   */
  extractTitle(html) {
    return this.normalizer.extractTitle(html);
  }

  /**
   * Extract text from HTML (simple version)
   */
  extractText(html) {
    return this.normalizer.extractText(html);
  }

  /**
   * Check if URL contains a date pattern (indicates article, not hub)
   */
  isDatedArticle(url) {
    return this.normalizer.isDatedArticle(url);
  }
}

module.exports = HubValidator;
