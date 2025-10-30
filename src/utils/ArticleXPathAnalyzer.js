/**
 * ArticleXPathAnalyzer - Analyzes HTML structure to identify XPath patterns for article content extraction
 */
const { createJsdom } = require('./jsdomUtils');

class ArticleXPathAnalyzer {
  constructor(options = {}) {
    this.options = {
      limit: 5,
      verbose: false,
      maxDepth: 5,
      minTextLength: 200,
      minParagraphs: 2,
      ...options
    };
  }

  /**
   * Analyze HTML content and return XPath patterns
   * @param {string} html - HTML content to analyze
   * @returns {object} Analysis results with top patterns
   */
  async analyzeHtml(html) {
    let dom = null;
    try {
      ({ dom } = createJsdom(html));
      const document = dom.window.document;

      const candidates = this.findArticleCandidates(document);
      const scoredCandidates = this.scoreCandidates(candidates, document);
      const xpathPatterns = this.generateXPathPatterns(scoredCandidates);

      return {
        documentInfo: {
          elements: document.querySelectorAll('*').length,
          textLength: document.body?.textContent?.length || 0
        },
        candidatesFound: candidates.length,
        topPatterns: xpathPatterns.slice(0, this.options.limit)
      };

    } catch (error) {
      throw new Error(`HTML analysis failed: ${error.message}`);
    } finally {
      if (dom) {
        dom.window.close();
      }
    }
  }

  /**
   * Find potential article container candidates
   * @param {Document} document - DOM document
   * @returns {Array} Candidate elements
   */
  findArticleCandidates(document) {
    const candidates = [];

    // Common article selectors
    const selectors = [
      'article',
      '[class*="article"]',
      '[class*="content"]',
      '[class*="story"]',
      '[class*="post"]',
      'main',
      '[role="main"]',
      '.content',
      '.article-content',
      '.story-content',
      '.post-content'
    ];

    for (const selector of selectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        if (this.isViableCandidate(element)) {
          candidates.push(element);
        }
      }
    }

    // Also consider direct children of body
    const bodyChildren = Array.from(document.body?.children || []);
    for (const child of bodyChildren) {
      if (this.isViableCandidate(child)) {
        candidates.push(child);
      }
    }

    return [...new Set(candidates)]; // Remove duplicates
  }

  /**
   * Check if element is a viable article candidate
   * @param {Element} element - DOM element
   * @returns {boolean} True if viable
   */
  isViableCandidate(element) {
    if (!element) return false;

    const text = element.textContent?.trim() || '';
    if (text.length < this.options.minTextLength) return false; // Too short

    const paragraphs = element.querySelectorAll('p');
    if (paragraphs.length < this.options.minParagraphs) return false; // Not enough paragraphs

    // Check for navigation-like content
    const navIndicators = ['menu', 'nav', 'navigation', 'sidebar', 'footer', 'header'];
    const className = element.className?.toLowerCase() || '';
    const id = element.id?.toLowerCase() || '';

    for (const indicator of navIndicators) {
      if (className.includes(indicator) || id.includes(indicator)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Score candidates based on article-like characteristics
   * @param {Array} candidates - Candidate elements
   * @param {Document} document - DOM document
   * @returns {Array} Scored candidates
   */
  scoreCandidates(candidates, document) {
    return candidates.map(element => {
      const text = element.textContent?.trim() || '';
      const paragraphs = element.querySelectorAll('p');
      const headings = element.querySelectorAll('h1, h2, h3, h4, h5, h6');

      let score = 0;
      const reasons = [];

      // Long content
      if (text.length > 1000) {
        score += 30;
        reasons.push('long-content');
      }

      // Semantic article tag
      if (element.tagName?.toLowerCase() === 'article') {
        score += 25;
        reasons.push('semantic-article');
      }

      // Semantic main tag
      if (element.tagName?.toLowerCase() === 'main') {
        score += 20;
        reasons.push('semantic-main');
      }

      // Content class names
      const contentClasses = ['content', 'article', 'story', 'post', 'entry'];
      const className = element.className?.toLowerCase() || '';
      for (const cls of contentClasses) {
        if (className.includes(cls)) {
          score += 15;
          reasons.push('content-class');
          break;
        }
      }

      // Many paragraphs
      if (paragraphs.length >= 5) {
        score += 20;
        reasons.push('many-paragraphs');
      }

      // Has headings
      if (headings.length > 0) {
        score += 10;
        reasons.push('has-headings');
      }

      // Penalize navigation-like content
      const navText = text.toLowerCase();
      const navWords = ['menu', 'navigation', 'categories', 'tags', 'related', 'advertisement'];
      for (const word of navWords) {
        if (navText.includes(word)) {
          score -= 15;
          reasons.push('nav-content');
          break;
        }
      }

      return {
        element,
        score,
        reasons,
        xpath: this.getXPath(element),
        stats: {
          chars: text.length,
          paras: paragraphs.length,
          headings: headings.length
        },
        preview: text.substring(0, 100) + (text.length > 100 ? '...' : '')
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Generate XPath patterns from scored candidates
   * @param {Array} scoredCandidates - Scored candidate elements
   * @returns {Array} XPath pattern objects
   */
  generateXPathPatterns(scoredCandidates) {
    const patterns = [];

    for (const candidate of scoredCandidates) {
      const confidence = Math.min(candidate.score / 100, 1.0);

      patterns.push({
        xpath: candidate.xpath,
        confidence,
        alternatives: this.generateAlternativeSelectors(candidate.element),
        reasons: candidate.reasons,
        stats: candidate.stats,
        preview: candidate.preview
      });
    }

    return patterns;
  }

  /**
   * Generate alternative CSS selectors for an element
   * @param {Element} element - DOM element
   * @returns {Array} Alternative selectors
   */
  generateAlternativeSelectors(element) {
    const alternatives = [];

    // By ID
    if (element.id) {
      alternatives.push(`#${element.id}`);
    }

    // By class combinations
    if (element.className) {
      const classes = element.className.trim().split(/\s+/);
      if (classes.length === 1) {
        alternatives.push(`.${classes[0]}`);
      } else if (classes.length >= 2) {
        // Add individual classes
        classes.forEach(cls => alternatives.push(`.${cls}`));
        // Add combined selector for first two classes
        alternatives.push(`.${classes[0]}.${classes[1]}`);
      }
    }

    // By tag name
    alternatives.push(element.tagName?.toLowerCase());

    return alternatives;
  }

  /**
   * Get XPath for an element
   * @param {Element} element - DOM element
   * @returns {string} XPath expression
   */
  getXPath(element) {
    if (element.id) {
      return `//*[@id="${element.id}"]`;
    }

    const parts = [];
    let current = element;

    while (current && current.nodeType === 1) {
      let index = 1;
      let sibling = current.previousSibling;

      while (sibling) {
        if (sibling.nodeType === 1 && sibling.tagName === current.tagName) {
          index++;
        }
        sibling = sibling.previousSibling;
      }

      const tagName = current.tagName.toLowerCase();
      const pathSegment = index > 1 ? `${tagName}[${index}]` : tagName;
      parts.unshift(pathSegment);

      current = current.parentNode;
      if (parts.length >= this.options.maxDepth) break;
    }

    return '/' + parts.join('/');
  }
}

module.exports = { ArticleXPathAnalyzer };