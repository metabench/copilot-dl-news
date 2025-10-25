/**
 * HubValidator - Comprehensive hub content validation with ML-based analysis
 *
 * Provides multi-signal validation for determining if a URL points to a country hub
 * rather than an article or other content type.
 */

const fetch = require('node-fetch');

class HubValidator {
  constructor({
    logger = console,
    thresholds = {
      lowConfidence: 0.3,
      highConfidence: 0.7
    },
    scoringWeights = {
      titleRelevance: 0.25,
      linkDensity: 0.20,
      contentStructure: 0.20,
      navigationPatterns: 0.15,
      temporalPatterns: 0.10,
      urlStructure: 0.10
    }
  } = {}) {
    this.logger = logger;
    this.thresholds = thresholds;
    this.scoringWeights = scoringWeights;

    // Caching for validation results
    this.validationCache = new Map();
    this.cacheMaxSize = 1000;
  }

  /**
   * Validate if a URL points to a country hub
   * @param {string} url - URL to validate
   * @param {Object} place - Place object with name, code, etc.
   * @returns {Object} Validation result
   */
  async validateHubContent(url, place) {
    try {
      // Check cache first
      const cacheKey = `${url}:${place.code}`;
      if (this.validationCache.has(cacheKey)) {
        return this.validationCache.get(cacheKey);
      }

      // Fetch and analyze content
      const content = await this.fetchContent(url);
      if (!content.success) {
        const result = {
          isValid: false,
          reason: `Fetch failed: ${content.error}`,
          confidence: 0,
          signals: { fetchFailed: true }
        };
        this.cacheResult(cacheKey, result);
        return result;
      }

      // Multi-signal analysis
      const signals = await this.analyzeContentSignals(content, place, url);

      // Calculate overall confidence
      const confidence = this.calculateOverallConfidence(signals);

      const result = {
        isValid: confidence >= this.thresholds.lowConfidence,
        reason: this.generateValidationReason(signals, confidence),
        confidence,
        signals
      };

      this.cacheResult(cacheKey, result);
      return result;

    } catch (error) {
      const result = {
        isValid: false,
        reason: `Validation error: ${error.message}`,
        confidence: 0,
        signals: { error: error.message }
      };
      this.cacheResult(cacheKey, result);
      return result;
    }
  }

  /**
   * Fetch content from URL with timeout and error handling
   * @param {string} url - URL to fetch
   * @returns {Object} Content result
   */
  async fetchContent(url) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; HubValidator/1.0)'
        }
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        return { success: false, error: `HTTP ${response.status}` };
      }

      const html = await response.text();
      const title = this.extractTitle(html);
      const links = this.extractLinks(html, url);

      return {
        success: true,
        html,
        title,
        links,
        url
      };

    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Analyze multiple validation signals
   * @param {Object} content - Fetched content
   * @param {Object} place - Place information
   * @param {string} url - Original URL
   * @returns {Object} Signal analysis results
   */
  async analyzeContentSignals(content, place, url) {
    const signals = {};

    // Signal 1: Title relevance
    signals.titleRelevance = this.analyzeTitleRelevance(content.title, place);

    // Signal 2: Link density and structure
    signals.linkAnalysis = this.analyzeLinkStructure(content.links, content.html);

    // Signal 3: Content structure (hub vs article)
    signals.contentStructure = this.analyzeContentStructure(content.html);

    // Signal 4: Navigation patterns
    signals.navigationPatterns = this.analyzeNavigationPatterns(content.html);

    // Signal 5: Temporal patterns (hubs are timeless)
    signals.temporalPatterns = this.analyzeTemporalPatterns(url, content.html);

    // Signal 6: URL structure analysis
    signals.urlStructure = this.analyzeUrlStructure(url, place);

    return signals;
  }

  /**
   * Analyze title relevance to place
   * @param {string} title - Page title
   * @param {Object} place - Place information
   * @returns {Object} Title analysis result
   */
  analyzeTitleRelevance(title, place) {
    if (!title || !place?.name) {
      return { score: 0, reason: 'Missing title or place data' };
    }

    const titleLower = title.toLowerCase();
    const placeNameLower = place.name.toLowerCase();
    const placeCodeLower = place.code?.toLowerCase();

    let score = 0;
    let matches = [];

    // Exact name match
    if (titleLower.includes(placeNameLower)) {
      score += 0.4;
      matches.push('name');
    }

    // Country code match
    if (placeCodeLower && titleLower.includes(placeCodeLower)) {
      score += 0.3;
      matches.push('code');
    }

    // Geographic keywords
    const geoKeywords = ['news', 'world', 'international', 'country', 'nation'];
    const hasGeoKeyword = geoKeywords.some(keyword => titleLower.includes(keyword));
    if (hasGeoKeyword) {
      score += 0.2;
      matches.push('geo-keyword');
    }

    // Penalize article-like titles
    const articleIndicators = [' - ', ' | ', '»', '–'];
    const hasArticleStructure = articleIndicators.some(indicator => title.includes(indicator));
    if (hasArticleStructure) {
      score *= 0.7; // Reduce score for article-like titles
    }

    return {
      score: Math.min(score, 1.0),
      matches,
      reason: matches.length > 0 ? `Matches: ${matches.join(', ')}` : 'No relevant matches'
    };
  }

  /**
   * Analyze link structure and density
   * @param {Array} links - Extracted links
   * @param {string} html - Full HTML content
   * @returns {Object} Link analysis result
   */
  analyzeLinkStructure(links, html) {
    if (!links || !html) {
      return { score: 0, reason: 'Missing link data' };
    }

    const totalLinks = links.length;
    const contentLength = html.length;
    const linkDensity = totalLinks / (contentLength / 1000); // Links per KB

    let score = 0;

    // Hub pages typically have moderate link density
    if (linkDensity >= 2 && linkDensity <= 20) {
      score += 0.4;
    } else if (linkDensity > 20) {
      score += 0.2; // Too many links might indicate navigation
    }

    // Check for hub-like link patterns
    const hubLinkPatterns = [
      /\/world\//,
      /\/news\//,
      /\/international\//,
      /\/country\//
    ];

    const hubLinks = links.filter(link =>
      hubLinkPatterns.some(pattern => pattern.test(link.url))
    ).length;

    if (hubLinks > 0) {
      score += 0.3;
    }

    // Check for article links (negative signal)
    const articleLinks = links.filter(link =>
      /\d{4}\/\d{2}\/\d{2}/.test(link.url) // Date patterns in URLs
    ).length;

    if (articleLinks > totalLinks * 0.5) {
      score *= 0.6; // Reduce score if too many article links
    }

    return {
      score: Math.min(score, 1.0),
      totalLinks,
      linkDensity: linkDensity.toFixed(2),
      hubLinks,
      articleLinks
    };
  }

  /**
   * Analyze content structure (hub vs article)
   * @param {string} html - HTML content
   * @returns {Object} Content structure analysis
   */
  analyzeContentStructure(html) {
    if (!html) {
      return { score: 0, reason: 'No content' };
    }

    let score = 0;

    // Check for hub-like structural elements
    const hubIndicators = [
      /<h[1-3][^>]*>.*?(news|world|international|countries?).*?<\/h[1-3]>/gi,
      /class="[^"]*(country|region|world)[^"]*"/gi,
      /id="[^"]*(hub|country|region)[^"]*"/gi
    ];

    let hubMatches = 0;
    for (const pattern of hubIndicators) {
      const matches = html.match(pattern);
      if (matches) {
        hubMatches += matches.length;
      }
    }

    if (hubMatches > 0) {
      score += Math.min(hubMatches * 0.2, 0.5);
    }

    // Check for article-like elements (negative signals)
    const articleIndicators = [
      /<article[^>]*>/gi,
      /class="[^"]*article[^"]*"/gi,
      /class="[^"]*story[^"]*"/gi,
      /published.*?\d{4}/gi,
      /byline|author/gi
    ];

    let articleMatches = 0;
    for (const pattern of articleIndicators) {
      const matches = html.match(pattern);
      if (matches) {
        articleMatches += matches.length;
      }
    }

    if (articleMatches > 0) {
      score *= Math.max(0.3, 1 - (articleMatches * 0.1)); // Reduce score for article elements
    }

    return {
      score: Math.min(score, 1.0),
      hubIndicators: hubMatches,
      articleIndicators: articleMatches
    };
  }

  /**
   * Analyze navigation patterns
   * @param {string} html - HTML content
   * @returns {Object} Navigation analysis
   */
  analyzeNavigationPatterns(html) {
    if (!html) {
      return { score: 0, reason: 'No content' };
    }

    let score = 0;

    // Look for navigation menus
    const navPatterns = [
      /<nav[^>]*>/gi,
      /class="[^"]*nav[^"]*"/gi,
      /class="[^"]*menu[^"]*"/gi,
      /id="[^"]*navigation[^"]*"/gi
    ];

    let navMatches = 0;
    for (const pattern of navPatterns) {
      const matches = html.match(pattern);
      if (matches) {
        navMatches += matches.length;
      }
    }

    if (navMatches > 0) {
      score += Math.min(navMatches * 0.15, 0.4);
    }

    // Check for breadcrumb navigation
    const breadcrumbPattern = /class="[^"]*breadcrumb[^"]*"/gi;
    if (breadcrumbPattern.test(html)) {
      score += 0.2;
    }

    return {
      score: Math.min(score, 1.0),
      navigationElements: navMatches,
      hasBreadcrumbs: breadcrumbPattern.test(html)
    };
  }

  /**
   * Analyze temporal patterns (hubs should be timeless)
   * @param {string} url - URL to analyze
   * @param {string} html - HTML content
   * @returns {Object} Temporal analysis
   */
  analyzeTemporalPatterns(url, html) {
    let score = 1.0; // Start with high score, reduce for temporal indicators

    // Check URL for date patterns
    const urlDatePatterns = [
      /\d{4}\/\d{2}\/\d{2}/,  // YYYY/MM/DD
      /\d{4}-\d{2}-\d{2}/,    // YYYY-MM-DD
      /\d{2}\/\d{2}\/\d{4}/,  // MM/DD/YYYY
      /\d{2}-\d{2}-\d{4}/     // MM-DD-YYYY
    ];

    for (const pattern of urlDatePatterns) {
      if (pattern.test(url)) {
        score *= 0.3; // Strong negative signal
        break;
      }
    }

    // Check content for temporal indicators
    if (html) {
      const contentDatePatterns = [
        /published.*?(\d{1,2} \w+ \d{4}|\d{4})/gi,
        /updated.*?(\d{1,2} \w+ \d{4}|\d{4})/gi,
        /class="[^"]*date[^"]*"/gi
      ];

      let temporalMatches = 0;
      for (const pattern of contentDatePatterns) {
        const matches = html.match(pattern);
        if (matches) {
          temporalMatches += matches.length;
        }
      }

      if (temporalMatches > 2) {
        score *= 0.7; // Moderate negative signal
      }
    }

    return {
      score,
      hasDateInUrl: urlDatePatterns.some(p => p.test(url)),
      temporalIndicators: temporalMatches || 0
    };
  }

  /**
   * Analyze URL structure for hub-like patterns
   * @param {string} url - URL to analyze
   * @param {Object} place - Place information
   * @returns {Object} URL structure analysis
   */
  analyzeUrlStructure(url, place) {
    try {
      const urlObj = new URL(url);
      const path = urlObj.pathname.toLowerCase();
      const segments = path.split('/').filter(s => s);

      let score = 0;

      // Check for hub-like path structures
      const hubPathPatterns = [
        /^\/world\/[^\/]+$/,
        /^\/news\/world\/[^\/]+$/,
        /^\/international\/[^\/]+$/,
        /^\/[^\/]+$/  // Simple slug pattern
      ];

      for (const pattern of hubPathPatterns) {
        if (pattern.test(path)) {
          score += 0.4;
          break;
        }
      }

      // Check if path contains place identifier
      const placeSlug = place.name.toLowerCase().replace(/[^a-z0-9]+/g, '-');
      const placeCode = place.code?.toLowerCase();

      if (path.includes(placeSlug) || (placeCode && path.includes(placeCode))) {
        score += 0.3;
      }

      // Penalize article-like URLs
      if (segments.length > 3 || /\d/.test(path)) {
        score *= 0.8;
      }

      return {
        score: Math.min(score, 1.0),
        path,
        segments: segments.length,
        containsPlaceIdentifier: path.includes(placeSlug) || path.includes(placeCode)
      };

    } catch (error) {
      return { score: 0, error: error.message };
    }
  }

  /**
   * Calculate overall confidence from all signals
   * @param {Object} signals - Signal analysis results
   * @returns {number} Overall confidence score
   */
  calculateOverallConfidence(signals) {
    let confidence = 0;

    confidence += signals.titleRelevance.score * this.scoringWeights.titleRelevance;
    confidence += signals.linkAnalysis.score * this.scoringWeights.linkDensity;
    confidence += signals.contentStructure.score * this.scoringWeights.contentStructure;
    confidence += signals.navigationPatterns.score * this.scoringWeights.navigationPatterns;
    confidence += signals.temporalPatterns.score * this.scoringWeights.temporalPatterns;
    confidence += signals.urlStructure.score * this.scoringWeights.urlStructure;

    return Math.min(confidence, 1.0);
  }

  /**
   * Generate human-readable validation reason
   * @param {Object} signals - Signal analysis results
   * @param {number} confidence - Overall confidence
   * @returns {string} Validation reason
   */
  generateValidationReason(signals, confidence) {
    const reasons = [];

    if (signals.titleRelevance.score < 0.3) {
      reasons.push('title does not match place');
    }

    if (signals.linkAnalysis.score < 0.3) {
      reasons.push('insufficient navigation links');
    }

    if (signals.contentStructure.score < 0.3) {
      reasons.push('content structure suggests article');
    }

    if (signals.temporalPatterns.score < 0.5) {
      reasons.push('contains temporal/date patterns');
    }

    if (signals.urlStructure.score < 0.3) {
      reasons.push('URL structure not hub-like');
    }

    if (reasons.length === 0) {
      return `High confidence hub (${(confidence * 100).toFixed(1)}% confidence)`;
    }

    return `Low confidence: ${reasons.join(', ')}`;
  }

  /**
   * Extract title from HTML
   * @param {string} html - HTML content
   * @returns {string|null} Page title
   */
  extractTitle(html) {
    const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
    return titleMatch ? titleMatch[1].trim() : null;
  }

  /**
   * Extract links from HTML
   * @param {string} html - HTML content
   * @param {string} baseUrl - Base URL for resolving relative links
   * @returns {Array} Array of link objects
   */
  extractLinks(html, baseUrl) {
    const links = [];
    const linkRegex = /<a[^>]+href="([^"]+)"[^>]*>([^<]*)<\/a>/gi;
    let match;

    try {
      const base = new URL(baseUrl);

      while ((match = linkRegex.exec(html)) !== null) {
        const href = match[1];
        const text = match[2].trim();

        try {
          const absoluteUrl = new URL(href, base).href;
          links.push({
            url: absoluteUrl,
            text: text || href
          });
        } catch (error) {
          // Skip invalid URLs
        }
      }
    } catch (error) {
      // Skip link extraction if base URL is invalid
    }

    return links;
  }

  /**
   * Cache validation result
   * @param {string} key - Cache key
   * @param {Object} result - Validation result
   */
  cacheResult(key, result) {
    if (this.validationCache.size >= this.cacheMaxSize) {
      // Remove oldest entry (simple FIFO)
      const firstKey = this.validationCache.keys().next().value;
      this.validationCache.delete(firstKey);
    }
    this.validationCache.set(key, result);
  }

  /**
   * Clear validation cache
   */
  clearCache() {
    this.validationCache.clear();
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getCacheStats() {
    return {
      size: this.validationCache.size,
      maxSize: this.cacheMaxSize,
      hitRate: 0 // Could be tracked with additional counters
    };
  }
}

module.exports = { HubValidator };