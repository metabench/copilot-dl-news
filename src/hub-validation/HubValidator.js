/**
 * HubValidator - Thorough validation of place and topic hubs
 * 
 * This module provides comprehensive validation for identifying whether
 * articles are actually place hubs or topic hubs, using multiple data sources
 * and verification strategies.
 */

const { getAllPlaceNames } = require('../db/sqlite/v1/queries/gazetteerPlaceNames');
const { getTopicTermsForLanguage } = require('../db/sqlite/v1/queries/topicKeywords');
const { getSkipTermsForLanguage } = require('../db/sqlite/v1/queries/crawlSkipTerms');

function bufferToString(input) {
  if (input == null) return null;
  if (typeof input === 'string') return input;
  if (Buffer.isBuffer(input)) return input.toString('utf8');
  return String(input);
}

function countLinks(html) {
  if (!html) return 0;
  return (String(html).match(/<a\b[^>]*href/gi) || []).length;
}

function toLower(value) {
  return typeof value === 'string' ? value.toLowerCase() : '';
}

class HubValidator {
  constructor(db) {
    this.db = db;
    this.placeNames = null;
    this.updateStmt = null;
    this.newsTopics = null;
    this.newsIndicators = null;
    this.commonNames = null;
    this.initialized = false;
  }
  
  /**
   * Initialize place names from gazetteer, load topics/skip terms, and prepare update statement
   */
  initialize() {
    if (this.initialized) return;
    // Load topics from database (multi-lingual support, currently using English)
    this.newsTopics = getTopicTermsForLanguage(this.db, 'en');
    
    // Load skip terms from database (news indicators and common person names)
    this.newsIndicators = getSkipTermsForLanguage(this.db, 'en');
    this.commonNames = getSkipTermsForLanguage(this.db, 'en');
    if (!this.placeNames) {
      this.placeNames = getAllPlaceNames(this.db);
    }
    if (!this.updateStmt) {
      this.updateStmt = this.db.prepare('UPDATE place_hubs SET url = ? WHERE id = ?');
    }
    this.initialized = true;
  }
  
  /**
   * Normalize a hub URL to its front page (remove pagination, query params)
   * @param {string} url - Original URL
   * @returns {string} - Normalized URL
   */
  normalizeHubUrl(url) {
    try {
      const urlObj = new URL(url);
      // Remove query parameters (page, etc)
      urlObj.search = '';
      // Remove hash
      urlObj.hash = '';
      return urlObj.href;
    } catch (error) {
      return url;
    }
  }
  
  /**
   * Check if we have a cached version of the URL
   * @param {string} url - URL to check
   * @returns {Object|null} - Article record or null
   */
  getCachedArticle(url) {
    const legacy = this._getLegacyArticle(url);
    if (legacy) return legacy;
    const normalized = this._getNormalizedArticle(url);
    if (normalized) return normalized;
    return null;
  }

  _getLegacyArticle(url) {
    try {
      const row = this.db.prepare(
        'SELECT id, url, title, html, text FROM articles WHERE url = ?'
      ).get(url);
      if (!row) return null;
      return {
        url: row.url,
        title: row.title,
        html: bufferToString(row.html || row.text || null),
        text: row.text || null,
        source: 'articles-table'
      };
    } catch (_) {
      return null;
    }
  }

  _getNormalizedArticle(url) {
    try {
      const row = this.db.prepare(`
        SELECT
          u.url AS url,
          ca.title AS title,
          cs.content_blob AS html,
          ca.word_count AS wordCount,
          ca.nav_links_count AS navLinksCount,
          ca.article_links_count AS articleLinksCount
        FROM urls u
        JOIN http_responses hr ON hr.url_id = u.id
        LEFT JOIN content_storage cs ON cs.http_response_id = hr.id
        LEFT JOIN content_analysis ca ON ca.content_id = cs.id
        WHERE u.url = ? OR u.canonical_url = ?
        ORDER BY hr.fetched_at DESC
        LIMIT 1
      `).get(url, url);
      if (!row) return null;
      return {
        url: row.url,
        title: row.title,
        html: bufferToString(row.html),
        wordCount: row.wordCount,
        navLinksCount: row.navLinksCount,
        articleLinksCount: row.articleLinksCount,
        source: 'normalized-http'
      };
    } catch (_) {
      return null;
    }
  }
  
  /**
   * Validate that a URL is actually a hub page by checking content
   * @param {string} url - URL to validate
   * @param {string} placeName - Expected place name
   * @returns {Promise<Object>} - { isValid: boolean, reason: string }
   */
  async validateHubContent(url, placeName, overrides = {}) {
    const providedHtml = overrides.html ? bufferToString(overrides.html) : null;
    const providedTitle = overrides.title || overrides.pageTitle || null;
    const providedMetrics = overrides.metrics || {};
    let article = null;
    let htmlSource = overrides.htmlSource || (providedHtml ? 'provided-html' : null);

    if (providedHtml) {
      article = {
        url,
        title: providedTitle || this.extractTitle(providedHtml),
        html: providedHtml,
        text: overrides.text || this.extractText(providedHtml),
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
      return this.analyzeHubContent(article, placeName, { htmlSource });
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
              title: this.extractTitle(data),
              html: data,
              text: this.extractText(data),
              source: 'network-fetch'
            };
            resolve(this.analyzeHubContent(fetchedArticle, placeName, { htmlSource: 'network-fetch' }));
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
    const evaluated = this._evaluateHub(article, placeName, options);
    return evaluated;
  }

  _evaluateHub(article, placeName, options = {}) {
    if (!article) {
      return {
        isValid: false,
        reason: 'No article content available',
        metrics: { htmlSource: options.htmlSource || 'unknown' }
      };
    }

    const metrics = this._buildValidationMetrics(article, placeName, options);

    let isValid = true;
    let reason = 'Content validates as hub page';

    if (!metrics.titleContainsPlace) {
      isValid = false;
      reason = `Title does not contain place name "${placeName}"`;
    } else if (metrics.linkCount < 20) {
      isValid = false;
      reason = `Too few links (${metrics.linkCount}) - not a hub page`;
    } else if (metrics.urlLooksDated) {
      isValid = false;
      reason = 'URL contains date - appears to be article, not hub';
    }

    return {
      isValid,
      reason,
      metrics
    };
  }

  _buildValidationMetrics(article, placeName, options = {}) {
    const html = bufferToString(article.html);
    const title = article.title || '';
    const linkCount = Number.isFinite(article.navLinksCount)
      ? article.navLinksCount
      : countLinks(html);
    const articleLinks = Number.isFinite(article.articleLinksCount)
      ? article.articleLinksCount
      : null;
    const titleContainsPlace = title.toLowerCase().includes((placeName || '').toLowerCase());
    const urlLooksDated = article.url ? this.isDatedArticle(article.url) : false;
    const paginated = article.url ? this.isPaginated(article.url) : false;

    return {
      htmlSource: options.htmlSource || article.source || 'unknown',
      linkCount,
      articleLinkCount: articleLinks,
      titleContainsPlace,
      urlLooksDated,
      paginated,
      placeName,
      title,
      wordCount: Number.isFinite(article.wordCount) ? article.wordCount : null
    };
  }
  
  /**
   * Extract title from HTML
   */
  extractTitle(html) {
    const match = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return match ? match[1].trim() : '';
  }
  
  /**
   * Extract text from HTML (simple version)
   */
  extractText(html) {
    return html
      .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .substring(0, 1000);
  }
  
  /**
   * Validate if a title/URL combination represents a place hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, placeName: string|null }
   */
  validatePlaceHub(title, url) {
    this.initialize();
    
    // Extract potential place name from title
    const extracted = this.extractPlaceName(title);
    if (!extracted) {
      return { isValid: false, reason: 'No place name pattern found', placeName: null };
    }
    
    const { name, pattern } = extracted;
    const nameLower = name.toLowerCase();
    
    // Check 1: Is this a known news topic instead of a place?
    if (this.newsTopics.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is a news topic, not a place`, placeName: null };
    }
    
    // Check 2: Is this a person's name?
    if (this.commonNames.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is a person's name, not a place`, placeName: null };
    }
    
    // Check 3: Does the title contain news-specific indicators?
    const titleLower = title.toLowerCase();
    for (const indicator of this.newsIndicators) {
      if (titleLower.includes(indicator) && !titleLower.startsWith('latest ') && !titleLower.includes(' news')) {
        return { isValid: false, reason: `Title contains news indicator: "${indicator}"`, placeName: null };
      }
    }
    
    // Check 4: Is the name in the gazetteer?
    if (!this.placeNames.has(nameLower)) {
      return { isValid: false, reason: `"${name}" not found in gazetteer`, placeName: null };
    }
    
    // Check 5: Does the URL structure support it being a place hub?
    if (!this.validatePlaceUrl(url, nameLower)) {
      return { isValid: false, reason: 'URL structure does not match place hub pattern', placeName: null };
    }
    
    // Check 6: Make sure it's not a dated article (place hubs are timeless)
    if (this.isDatedArticle(url)) {
      return { isValid: false, reason: 'URL contains date - appears to be article, not hub', placeName: null };
    }
    
    // All checks passed!
    return { isValid: true, reason: 'Validated as place hub', placeName: name };
  }
  
  /**
   * Validate if a title/URL combination represents a topic hub
   * @param {string} title - Article title
   * @param {string} url - Article URL
   * @returns {Object} - { isValid: boolean, reason: string, topicName: string|null }
   */
  validateTopicHub(title, url) {
    // Extract potential topic name from title
    const extracted = this.extractTopicName(title);
    if (!extracted) {
      return { isValid: false, reason: 'No topic name pattern found', topicName: null };
    }
    
    const { name } = extracted;
    const nameLower = name.toLowerCase();
    
    // Check 1: Is this actually a known news topic?
    if (!this.newsTopics.has(nameLower)) {
      return { isValid: false, reason: `"${name}" is not a recognized news topic`, topicName: null };
    }
    
    // Check 2: Does the URL structure support it being a topic hub?
    if (!this.validateTopicUrl(url, nameLower)) {
      return { isValid: false, reason: 'URL structure does not match topic hub pattern', topicName: null };
    }
    
    // Check 3: Make sure it's not a dated article
    if (this.isDatedArticle(url)) {
      return { isValid: false, reason: 'URL contains date - appears to be article, not hub', topicName: null };
    }
    
    // All checks passed!
    return { isValid: true, reason: 'Validated as topic hub', topicName: name };
  }
  
  /**
   * Extract place name from title using various patterns
   */
  extractPlaceName(title) {
    // Pattern 1: "PlaceName | Publication"
    const pattern1 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
    if (pattern1) {
      return { name: pattern1[1], pattern: 'prefix' };
    }
    
    // Pattern 2: "Latest PlaceName news"
    const pattern2 = title.match(/^Latest\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern2) {
      return { name: pattern2[1], pattern: 'latest' };
    }
    
    // Pattern 3: "PlaceName news and comment"
    const pattern3 = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+news/i);
    if (pattern3) {
      return { name: pattern3[1], pattern: 'news' };
    }
    
    return null;
  }
  
  /**
   * Extract topic name from title
   */
  extractTopicName(title) {
    // Pattern: "TopicName | Publication"
    const pattern = title.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+\|/);
    if (pattern) {
      return { name: pattern[1], pattern: 'prefix' };
    }
    
    return null;
  }
  
  /**
   * Validate URL structure for place hubs
   */
  validatePlaceUrl(url, placeName) {
    const urlLower = url.toLowerCase();
    const placeNameForUrl = placeName.replace(/\s+/g, '-');
    
    // Common patterns for place hubs:
    // - /world/france
    // - /australia-news
    // - /us-news/texas
    
    if (urlLower.includes(`/${placeNameForUrl}`) || 
        urlLower.includes(`-${placeNameForUrl}`) ||
        urlLower.includes(`/${placeName.replace(/\s+/g, '')}`)) {
      return true;
    }
    
    // Special case: country/region sections
    if (urlLower.includes('/world/') || 
        urlLower.includes('/australia-news') ||
        urlLower.includes('/us-news') ||
        urlLower.includes('/uk-news')) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Validate URL structure for topic hubs
   */
  validateTopicUrl(url, topicName) {
    const urlLower = url.toLowerCase();
    
    // Direct topic match in URL
    if (urlLower.includes(`/${topicName}/`) || 
        urlLower.endsWith(`/${topicName}`)) {
      return true;
    }
    
    // Special mappings
    const topicMappings = {
      'sport': 'sport',
      'sports': 'sport',
      'opinion': 'commentisfree',
      'commentisfree': 'commentisfree',
      'lifestyle': 'lifeandstyle',
      'lifeandstyle': 'lifeandstyle'
    };
    
    const mappedTopic = topicMappings[topicName] || topicName;
    if (urlLower.includes(`/${mappedTopic}/`) || 
        urlLower.endsWith(`/${mappedTopic}`)) {
      return true;
    }
    
    return false;
  }
  
  /**
   * Check if URL contains a date pattern (indicates article, not hub)
   */
  isDatedArticle(url) {
    // Match patterns like /2025/oct/14/ or /2025/10/14/
    return /\/\d{4}\/[a-z]{3}\/\d{1,2}\//i.test(url) ||
           /\/\d{4}\/\d{1,2}\/\d{1,2}\//i.test(url);
  }
  
  /**
   * Check if URL has pagination parameters
   */
  isPaginated(url) {
    return /[?&]page=\d+/.test(url);
  }
}

module.exports = HubValidator;
