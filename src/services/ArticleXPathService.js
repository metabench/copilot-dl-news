/**
 * ArticleXPathService - Manages XPath patterns for article content extraction
 *
 * Provides learning and application of Domain-Specific XPath Libraries (DXPLs)
 * for fast article extraction without DOM parsing.
 *
 * Uses ArticleXPathAnalyzer for pattern discovery and DXPLs for storage.
 */

const path = require('path');
const { loadDxplLibrary, getDxplForDomain, extractDomain } = require('./shared/dxpl');
const { ArticleXPathAnalyzer } = require('../utils/ArticleXPathAnalyzer');

class ArticleXPathService {
  constructor({
    db,
    logger = console,
    dxplDir = path.join(__dirname, '..', '..', 'data', 'dxpls'),
    analyzerOptions = {}
  } = {}) {
    if (!db) {
      throw new Error('ArticleXPathService requires a database connection');
    }

    this.db = db;
    this.logger = logger;
    this.dxplDir = dxplDir;
    this.analyzerOptions = { limit: 3, verbose: false, ...analyzerOptions };

    // Load DXPLs on initialization
    this.dxpls = loadDxplLibrary({ dxplDir: this.dxplDir, logger: this.logger });
  }

  /**
   * Get stored XPath pattern for a domain
   * @param {string} domain - Domain to look up
   * @returns {object|null} XPath pattern with confidence or null
   */
  getXPathForDomain(domain) {
    const dxpl = getDxplForDomain(this.dxpls, domain);
    if (!dxpl || !dxpl.articleXPathPatterns || dxpl.articleXPathPatterns.length === 0) {
      return null;
    }

    // Return the highest confidence pattern
    return dxpl.articleXPathPatterns[0];
  }

  /**
   * Learn XPath pattern from HTML content
   * @param {string} url - Article URL
   * @param {string} html - Article HTML content
   * @returns {object|null} Learned XPath pattern or null if learning failed
   */
  async learnXPathFromHtml(url, html) {
    try {
      const domain = extractDomain(url);
      if (!domain) {
        this.logger.warn(`[xpath-service] Invalid URL for XPath learning: ${url}`);
        return null;
      }

      const analyzer = new ArticleXPathAnalyzer(this.analyzerOptions);
      const result = await analyzer.analyzeHtml(html);

      if (!result || !result.topPatterns || result.topPatterns.length === 0) {
        this.logger.warn(`[xpath-service] No XPath patterns found for ${url}`);
        return null;
      }

      const topPattern = result.topPatterns[0];
      const xpathPattern = {
        xpath: topPattern.xpath,
        confidence: topPattern.confidence,
        alternatives: topPattern.alternatives || [],
        learnedFrom: url,
        learnedAt: new Date().toISOString(),
        sampleTextLength: topPattern.stats?.chars || 0,
        paragraphCount: topPattern.stats?.paras || 0
      };

      // Store in DXPL
      this._storeXPathPattern(domain, xpathPattern);

      this.logger.log(`[xpath-service] Learned XPath pattern for ${domain}: ${xpathPattern.xpath} (${Math.round(xpathPattern.confidence * 100)}% confidence)`);

      return xpathPattern;

    } catch (error) {
      this.logger.error(`[xpath-service] Failed to learn XPath from ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Extract article text using stored XPath pattern
   * @param {string} url - Article URL
   * @param {string} html - Article HTML content
   * @returns {string|null} Extracted text or null if extraction failed
   */
  extractTextWithXPath(url, html) {
    try {
      const domain = extractDomain(url);
      if (!domain) return null;

      const xpathPattern = this.getXPathForDomain(domain);
      if (!xpathPattern) return null;

      // Use the XPath to extract content
      const extractedText = this._extractWithXPath(html, xpathPattern.xpath);
      if (!extractedText || extractedText.trim().length < 50) {
        return null; // Too short, probably failed
      }

      return extractedText.trim();

    } catch (error) {
      this.logger.warn(`[xpath-service] XPath extraction failed for ${url}: ${error.message}`);
      return null;
    }
  }

  /**
   * Check if domain has learned XPath patterns
   * @param {string} domain - Domain to check
   * @returns {boolean} True if patterns exist
   */
  hasXPathForDomain(domain) {
    return this.getXPathForDomain(domain) !== null;
  }

  // Private methods

  _storeXPathPattern(domain, xpathPattern) {
    // Initialize DXPL entry if needed
    if (!this.dxpls.has(domain)) {
      this.dxpls.set(domain, {
        domain,
        generated: new Date().toISOString(),
        articleXPathPatterns: []
      });
    }

    const dxpl = this.dxpls.get(domain);

    // Add pattern (keep only top 3 by confidence)
    dxpl.articleXPathPatterns.push(xpathPattern);
    dxpl.articleXPathPatterns.sort((a, b) => b.confidence - a.confidence);
    dxpl.articleXPathPatterns = dxpl.articleXPathPatterns.slice(0, 3);

    // Update stats
    dxpl.stats = {
      totalPatterns: dxpl.articleXPathPatterns.length,
      lastUpdated: new Date().toISOString()
    };

    // TODO: Persist to disk (would need saveDxplLibrary function)
    // For now, patterns are cached in memory only
  }

  _extractWithXPath(html, xpath) {
    // Simple XPath extraction using basic DOM parsing
    // In production, would use a proper XPath library
    try {
      const { JSDOM } = require('jsdom');
      const dom = new JSDOM(html);
      const document = dom.window.document;

      // Convert XPath to CSS selector (simplified)
      const cssSelector = this._xpathToCssSelector(xpath);
      if (!cssSelector) return null;

      const element = document.querySelector(cssSelector);
      if (!element) return null;

      return element.textContent || element.innerHTML || null;

    } catch (error) {
      return null;
    }
  }

  _xpathToCssSelector(xpath) {
    // Very basic XPath to CSS selector conversion
    // In production, would use a proper XPath library
    if (xpath.startsWith('/html/body/')) {
      const parts = xpath.replace('/html/body/', '').split('/');
      return parts.map(part => {
        if (part.includes('[')) {
          // Handle [1] indexing (first child)
          const [tag, index] = part.split('[');
          const idx = parseInt(index.replace(']', ''));
          return idx === 1 ? tag : `${tag}:nth-child(${idx})`;
        }
        return part;
      }).join(' > ');
    }

    // Fallback for common patterns
    if (xpath === '/body/main/article') return 'body > main > article';
    if (xpath === '/html/body/main/article') return 'main > article';

    return null; // Can't convert
  }
}

module.exports = { ArticleXPathService };