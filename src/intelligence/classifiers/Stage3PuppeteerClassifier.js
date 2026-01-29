'use strict';

/**
 * @fileoverview Stage 3: Puppeteer-Based Classification
 * 
 * Classifies pages by analyzing the rendered DOM using Puppeteer.
 * Part of the Classification Cascade architecture.
 * 
 * This is the most accurate but most expensive classifier:
 * - Requires browser instance
 * - Sees JavaScript-rendered content
 * - Can measure visual layout and content areas
 * 
 * Use selectively for:
 * - Low-confidence results from Stage 1+2
 * - Known JS-heavy sites (SPAs)
 * - Verification of important classifications
 * 
 * @example
 * const { Stage3PuppeteerClassifier } = require('./Stage3PuppeteerClassifier');
 * const classifier = new Stage3PuppeteerClassifier();
 * await classifier.init();
 * const result = await classifier.classify('https://example.com/article');
 * await classifier.destroy();
 * // { classification: 'article', confidence: 0.92, reason: 'large-content-block+semantic-article', signals: {...} }
 */

const puppeteer = require('puppeteer');

/**
 * Default classification thresholds
 */
const DEFAULT_OPTIONS = {
  // Navigation timeout in ms
  navigationTimeout: 30000,
  
  // Extra wait after navigation for JS content to settle
  extraWaitMs: 1000,
  
  // Minimum word count for main content to be considered an article
  minArticleWords: 150,
  
  // Minimum content area (pixels²) for article classification
  minArticleArea: 50000,
  
  // Maximum link density for article classification
  maxArticleLinkDensity: 0.35,
  
  // Minimum links for hub/nav classification
  minHubLinks: 10,
  
  // Headless mode (set false for debugging)
  headless: true
};

class Stage3PuppeteerClassifier {
  /**
   * @param {Object} options
   * @param {Object} [options.browserPool] - BrowserPoolManager instance (optional)
   * @param {number} [options.navigationTimeout] - Page load timeout
   * @param {number} [options.extraWaitMs] - Extra wait for JS content
   * @param {boolean} [options.headless] - Run headless browser
   */
  constructor(options = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this._browser = null;
    this._browserPool = options.browserPool || null;
    this._usePool = !!this._browserPool;
    this._initialized = false;
  }

  /**
   * Initialize the classifier (launch browser if not using pool)
   */
  async init() {
    if (this._initialized) return;
    
    if (!this._usePool) {
      this._browser = await puppeteer.launch({
        headless: this.options.headless ? 'new' : false,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      });
    }
    
    this._initialized = true;
  }

  /**
   * Destroy the classifier (close browser if not using pool)
   */
  async destroy() {
    if (this._browser) {
      await this._browser.close();
      this._browser = null;
    }
    this._initialized = false;
  }

  /**
   * Classify a URL by rendering it and analyzing the DOM
   * 
   * @param {string} url - URL to classify
   * @param {Object} [options] - Classification options
   * @param {boolean} [options.includeScreenshot] - Include base64 screenshot in signals
   * @returns {Promise<Object>} Classification result
   */
  async classify(url, options = {}) {
    if (!this._initialized) {
      await this.init();
    }

    let page = null;
    let browser = null;
    let pooled = null;

    try {
      // Acquire page from pool or create new
      if (this._usePool && this._browserPool) {
        pooled = await this._browserPool.acquire();
        browser = pooled.browser;
        page = await browser.newPage();
      } else if (this._browser) {
        page = await this._browser.newPage();
      } else {
        throw new Error('Classifier not initialized');
      }

      // Navigate to URL
      await page.goto(url, {
        waitUntil: 'networkidle2',
        timeout: this.options.navigationTimeout
      });

      // Wait for JS content to settle
      await new Promise(resolve => setTimeout(resolve, this.options.extraWaitMs));

      // Extract visual signals from rendered page
      const signals = await this._extractSignals(page);

      // Compute classification from signals
      const result = this._computeClassification(signals);

      // Optionally include screenshot
      if (options.includeScreenshot) {
        signals.screenshot = await page.screenshot({ encoding: 'base64', type: 'jpeg', quality: 50 });
      }

      return {
        classification: result.classification,
        confidence: result.confidence,
        reason: result.reason,
        signals
      };

    } finally {
      if (page) {
        await page.close().catch(() => {});
      }
      if (pooled && this._browserPool) {
        this._browserPool.release(pooled);
      }
    }
  }

  /**
   * Extract visual signals from the rendered page
   * @private
   */
  async _extractSignals(page) {
    return await page.evaluate(() => {
      /**
       * Find all significant text blocks
       */
      function findTextBlocks() {
        const blocks = [];
        const candidates = document.querySelectorAll('p, article, div, section, main, [role="main"]');
        
        for (const el of candidates) {
          const text = el.innerText || '';
          const words = text.split(/\s+/).filter(w => w.length > 0);
          const wordCount = words.length;
          const rect = el.getBoundingClientRect();
          
          if (wordCount > 30 && rect.width > 100 && rect.height > 50) {
            // Count links within this element
            const links = el.querySelectorAll('a');
            const linkText = Array.from(links).map(a => a.innerText || '').join(' ');
            const linkWords = linkText.split(/\s+/).filter(w => w.length > 0).length;
            const linkDensity = wordCount > 0 ? linkWords / wordCount : 0;
            
            blocks.push({
              tagName: el.tagName.toLowerCase(),
              className: el.className || '',
              id: el.id || '',
              wordCount,
              linkCount: links.length,
              linkDensity,
              area: rect.width * rect.height,
              rect: {
                x: Math.round(rect.x),
                y: Math.round(rect.y),
                width: Math.round(rect.width),
                height: Math.round(rect.height)
              }
            });
          }
        }
        
        // Sort by word count, return top blocks
        blocks.sort((a, b) => b.wordCount - a.wordCount);
        return blocks.slice(0, 5);
      }

      /**
       * Check for semantic article elements
       */
      function checkSemanticElements() {
        return {
          hasArticle: document.querySelector('article') !== null,
          hasMain: document.querySelector('main, [role="main"]') !== null,
          hasNav: document.querySelector('nav, [role="navigation"]') !== null,
          hasAside: document.querySelector('aside') !== null,
          hasHeader: document.querySelector('header, [role="banner"]') !== null,
          hasFooter: document.querySelector('footer, [role="contentinfo"]') !== null
        };
      }

      /**
       * Count all navigation-style links
       */
      function countNavLinks() {
        const navElements = document.querySelectorAll('nav, [role="navigation"], .nav, .menu, .sidebar');
        let navLinkCount = 0;
        for (const nav of navElements) {
          navLinkCount += nav.querySelectorAll('a').length;
        }
        return navLinkCount;
      }

      /**
       * Check for article schema
       */
      function checkSchema() {
        // JSON-LD
        const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
        let hasArticleSchema = false;
        let articleType = null;
        
        for (const script of jsonLdScripts) {
          try {
            const data = JSON.parse(script.textContent);
            const types = Array.isArray(data) ? data.map(d => d['@type']) : [data['@type']];
            for (const t of types) {
              if (t && (t.includes('Article') || t.includes('NewsArticle') || t.includes('BlogPosting'))) {
                hasArticleSchema = true;
                articleType = t;
                break;
              }
            }
          } catch (e) {
            // Ignore parse errors
          }
        }
        
        // OpenGraph
        const ogType = document.querySelector('meta[property="og:type"]')?.content;
        const isOgArticle = ogType === 'article';
        
        return {
          hasArticleSchema,
          articleType,
          ogType,
          isOgArticle
        };
      }

      /**
       * Get total link count on page
       */
      function getTotalLinkCount() {
        return document.querySelectorAll('a[href]').length;
      }

      /**
       * Get page title
       */
      function getTitle() {
        return document.title || document.querySelector('h1')?.innerText || null;
      }

      // Gather all signals
      const textBlocks = findTextBlocks();
      const semantic = checkSemanticElements();
      const schema = checkSchema();
      const navLinkCount = countNavLinks();
      const totalLinkCount = getTotalLinkCount();
      
      // Compute largest content block
      const largestBlock = textBlocks[0] || null;
      
      return {
        title: getTitle(),
        largestBlock,
        textBlocks,
        semantic,
        schema,
        navLinkCount,
        totalLinkCount,
        pageWordCount: document.body?.innerText?.split(/\s+/).filter(w => w.length > 0).length || 0
      };
    });
  }

  /**
   * Compute classification from extracted signals
   * @private
   */
  _computeClassification(signals) {
    const opts = this.options;
    const reasons = [];
    let articleScore = 0;
    let hubScore = 0;
    let navScore = 0;

    // 1. Check semantic elements
    if (signals.semantic.hasArticle) {
      articleScore += 3;
      reasons.push('semantic-article');
    }
    if (signals.semantic.hasMain && !signals.semantic.hasAside) {
      articleScore += 1;
      reasons.push('main-content-area');
    }
    if (signals.semantic.hasNav) {
      navScore += 1;
    }

    // 2. Check schema.org signals
    if (signals.schema.hasArticleSchema) {
      articleScore += 4;
      reasons.push(`schema:${signals.schema.articleType || 'Article'}`);
    }
    if (signals.schema.isOgArticle) {
      articleScore += 2;
      reasons.push('og:article');
    }

    // 3. Check largest content block
    const block = signals.largestBlock;
    if (block) {
      if (block.wordCount >= opts.minArticleWords) {
        articleScore += 3;
        reasons.push(`words:${block.wordCount}`);
      } else if (block.wordCount < 100) {
        hubScore += 1;
      }

      if (block.area >= opts.minArticleArea) {
        articleScore += 1;
        reasons.push('large-content-area');
      }

      if (block.linkDensity <= opts.maxArticleLinkDensity) {
        articleScore += 1;
        reasons.push(`low-link-density:${block.linkDensity.toFixed(2)}`);
      } else {
        hubScore += 2;
        reasons.push(`high-link-density:${block.linkDensity.toFixed(2)}`);
      }
    }

    // 4. Check navigation links
    if (signals.navLinkCount >= opts.minHubLinks) {
      navScore += 2;
      reasons.push(`nav-links:${signals.navLinkCount}`);
    }

    // 5. Check total link density
    const totalLinkDensity = signals.pageWordCount > 0 
      ? signals.totalLinkCount / signals.pageWordCount 
      : 0;
    if (totalLinkDensity > 0.5) {
      hubScore += 2;
      reasons.push('page-link-heavy');
    }

    // Determine classification
    let classification = 'unknown';
    let confidence = 0.5;

    if (articleScore > hubScore && articleScore > navScore && articleScore >= 4) {
      classification = 'article';
      const total = articleScore + hubScore + navScore;
      confidence = total > 0 ? articleScore / total : 0.5;
      confidence = Math.min(0.95, Math.max(0.6, confidence));
    } else if (hubScore > articleScore || navScore > articleScore) {
      if (navScore > hubScore) {
        classification = 'nav';
      } else {
        classification = 'hub';
      }
      const total = articleScore + hubScore + navScore;
      const winningScore = Math.max(hubScore, navScore);
      confidence = total > 0 ? winningScore / total : 0.5;
      confidence = Math.min(0.9, Math.max(0.5, confidence));
    } else {
      // Low confidence
      classification = articleScore > 0 ? 'article' : 'unknown';
      confidence = 0.4;
    }

    return {
      classification,
      confidence,
      reason: reasons.join('+') || 'no-strong-signals'
    };
  }
}

module.exports = { Stage3PuppeteerClassifier };
