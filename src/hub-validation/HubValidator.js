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
    try {
      const article = this.db.prepare(
        'SELECT id, url, title, html, text FROM articles WHERE url = ?'
      ).get(url);
      return article || null;
    } catch (error) {
      return null;
    }
  }
  
  /**
   * Validate that a URL is actually a hub page by checking content
   * @param {string} url - URL to validate
   * @param {string} placeName - Expected place name
   * @returns {Promise<Object>} - { isValid: boolean, reason: string }
   */
  async validateHubContent(url, placeName) {
    // First check if we have cached content
    let article = this.getCachedArticle(url);
    
    if (article) {
      // Validate cached content
      return this.analyzeHubContent(article, placeName);
    }
    
    // If not cached, try to fetch it
    try {
      const https = require('https');
      const http = require('http');
      
      return await new Promise((resolve, reject) => {
        const urlObj = new URL(url);
        const protocol = urlObj.protocol === 'https:' ? https : http;
        
        const options = {
          method: 'GET',
          headers: {
            'User-Agent': 'Mozilla/5.0 (compatible; NewsBot/1.0)'
          },
          timeout: 10000
        };
        
        const req = protocol.get(url, options, (res) => {
          if (res.statusCode !== 200) {
            resolve({ 
              isValid: false, 
              reason: `HTTP ${res.statusCode} response` 
            });
            return;
          }
          
          let data = '';
          res.on('data', chunk => data += chunk);
          res.on('end', () => {
            const mockArticle = { 
              url, 
              title: this.extractTitle(data),
              html: data,
              text: this.extractText(data)
            };
            resolve(this.analyzeHubContent(mockArticle, placeName));
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
  analyzeHubContent(article, placeName) {
    // Check 1: Title should contain place name
    if (!article.title || !article.title.toLowerCase().includes(placeName.toLowerCase())) {
      return { 
        isValid: false, 
        reason: `Title does not contain place name "${placeName}"` 
      };
    }
    
    // Check 2: Content should have multiple links (hubs have many article links)
    const linkCount = (article.html || '').match(/<a[^>]+href/gi)?.length || 0;
    if (linkCount < 20) {
      return { 
        isValid: false, 
        reason: `Too few links (${linkCount}) - not a hub page` 
      };
    }
    
    // Check 3: Should not be a dated article
    if (article.url.match(/\/\d{4}\/[a-z]{3}\/\d{1,2}\//i)) {
      return { 
        isValid: false, 
        reason: 'URL contains date - is an article, not hub' 
      };
    }
    
    return { 
      isValid: true, 
      reason: 'Content validates as hub page' 
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
