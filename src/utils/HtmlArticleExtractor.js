/**
 * HTML Analysis Utilities
 *
 * Provides general-purpose HTML analysis for extracting article content,
 * identifying main content areas, and filtering out navigation/ads.
 */

const { Readability } = require('@mozilla/readability');
const { JSDOM } = require('jsdom');

/**
 * HTML Article Extractor
 *
 * Uses Mozilla Readability to extract the main article content from HTML,
 * filtering out navigation, ads, footers, and other non-article content.
 */
class HtmlArticleExtractor {
  constructor(options = {}) {
    this.options = {
      minWordCount: options.minWordCount || 50,
      maxNavigationDensity: options.maxNavigationDensity || 0.3,
      ...options
    };
  }

  /**
   * Extract article content from HTML
   *
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL (for context)
   * @returns {Object} Extraction result
   */
  extract(html, url = null) {
    if (!html || typeof html !== 'string') {
      return {
        success: false,
        text: '',
        wordCount: 0,
        error: 'Invalid HTML input'
      };
    }

    try {
      // Create DOM from HTML
      const dom = new JSDOM(html, {
        url: url || 'https://example.com',
        virtualConsole: this._createVirtualConsole()
      });

      // Run Readability extraction
      const reader = new Readability(dom.window.document, {
        debug: false,
        maxElemsToParse: 0, // No limit
        nbTopCandidates: 5,
        charThreshold: 500,
        classesToPreserve: []
      });

      const article = reader.parse();

      if (!article || !article.textContent) {
        return {
          success: false,
          text: '',
          wordCount: 0,
          error: 'No article content found'
        };
      }

      // Clean and normalize the extracted text
      let text = article.textContent.trim();

      // Remove excessive whitespace
      text = text.replace(/\s+/g, ' ');

      // Basic navigation filtering (Readability should handle most, but add some extra)
      text = this._filterNavigationContent(text);

      const wordCount = this._countWords(text);

      // Validate minimum content requirements
      if (wordCount < this.options.minWordCount) {
        return {
          success: false,
          text: '',
          wordCount: 0,
          error: `Content too short (${wordCount} words, minimum ${this.options.minWordCount})`
        };
      }

      return {
        success: true,
        text,
        wordCount,
        title: article.title || null,
        excerpt: article.excerpt || null,
        byline: article.byline || null,
        siteName: article.siteName || null,
        language: article.language || null
      };

    } catch (error) {
      return {
        success: false,
        text: '',
        wordCount: 0,
        error: `Extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Extract clean text for place matching (optimized for entity recognition)
   *
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL
   * @param {Object} options - Extraction options
   * @returns {string} Clean text suitable for place matching
   */
  extractForPlaceMatching(html, url = null, options = {}) {
    const result = this.extract(html, url);

    if (!result.success) {
      // Fallback to basic HTML stripping if Readability fails
      console.warn(`Readability extraction failed, using basic HTML stripping`);
      return this._basicHtmlStrip(html);
    }

    let text = result.text;

    // Apply additional filtering for place matching
    if (options.removeNavigation !== false) {
      text = this._filterNavigationContent(text);
    }

    // Apply text limiting if specified
    if (options.maxLength && text.length > options.maxLength) {
      text = text.substring(0, options.maxLength);
    }

    return text;
  }

  /**
   * Remove navigation elements from DOM before Readability processing
   */
  _removeNavigationElements(document) {
    // Remove common navigation selectors
    const selectorsToRemove = [
      // Guardian-specific navigation
      '.navigation',
      '.nav',
      '.navbar',
      '.menu',
      '.header',
      '.site-header',
      '.main-navigation',
      '.secondary-navigation',
      '.tertiary-navigation',
      '.breadcrumb',
      '.breadcrumbs',
      // Skip links
      '.skip-link',
      '.skip-links',
      '.skip-to-content',
      '.skip-navigation',
      // Common menu patterns
      '[role="navigation"]',
      'nav',
      '.nav-menu',
      '.main-menu',
      '.top-menu',
      '.footer-menu',
      // Guardian edition switcher
      '.edition-switcher',
      '.edition-selector',
      // Search and account elements
      '.search-form',
      '.search-box',
      '.user-menu',
      '.account-menu',
      '.login-menu',
      // Social sharing
      '.social-share',
      '.share-buttons',
      '.social-links',
      // Newsletter signup
      '.newsletter-signup',
      '.newsletter-form',
      // Related content
      '.related-content',
      '.related-articles',
      '.related-links',
      // Ads and commercial content
      '.advertisement',
      '.ad-container',
      '.sponsored-content'
    ];

    selectorsToRemove.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          element.remove();
        });
      } catch (error) {
        // Ignore selector errors
      }
    });

    // Remove elements with navigation-like text content
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      const text = element.textContent?.trim().toLowerCase() || '';
      if (text.length > 0 && text.length < 200) { // Only check reasonably short text
        // Remove elements that contain navigation-like phrases
        const navPhrases = [
          'skip to main content',
          'skip to navigation',
          'print subscriptions',
          'search jobs',
          'sign in',
          'my account',
          'account overview',
          'switch to the uk edition',
          'switch to the us edition',
          'switch to the australia edition',
          'current edition:',
          'the guardian - back to home',
          'show more hide expanded menu',
          'news view all news',
          'uk news us politics world news'
        ];

        if (navPhrases.some(phrase => text.includes(phrase))) {
          element.remove();
        }
      }
    });
  }

  /**
   * Filter out navigation and menu content from extracted text
   */
  _filterNavigationContent(text) {
    if (!text) return '';

    // Split into lines for processing
    const lines = text.split('\n');
    const filteredLines = [];

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip very short lines (likely navigation remnants)
      if (trimmed.length < 10) {
        continue;
      }

      // Skip lines that look like menus or navigation
      if (this._isNavigationLine(trimmed)) {
        continue;
      }

      filteredLines.push(line);
    }

    let result = filteredLines.join('\n').trim();

    // Additional aggressive filtering for Guardian-specific patterns
    result = result
      // Remove Guardian header/navigation patterns
      .replace(/\bSkip to main content\b/gi, '')
      .replace(/\bSkip to navigation\b/gi, '')
      .replace(/\bSkip to key events\b/gi, '')
      .replace(/\bClose dialogue\b/gi, '')
      .replace(/\bToggle caption\b/gi, '')
      .replace(/\bNext image Previous image\b/gi, '')
      .replace(/\bPrint subscriptions\b/gi, '')
      .replace(/\bSearch jobs\b/gi, '')
      .replace(/\bSign in\b/gi, '')
      .replace(/\bMy account\b/gi, '')
      .replace(/\bAccount overview\b/gi, '')
      .replace(/\bBilling Profile\b/gi, '')
      .replace(/\bEmails & marketing\b/gi, '')
      .replace(/\bData privacy\b/gi, '')
      .replace(/\bSettings Help\b/gi, '')
      .replace(/\bComments & replies\b/gi, '')
      .replace(/\bSign out\b/gi, '')
      // Remove edition selectors
      .replace(/\bUK UK edition US edition Australia edition Europe edition International edition\b/gi, '')
      .replace(/\bcurrent edition:.*?\b/gi, '')
      .replace(/\bswitch to the (UK|US|Australia|Europe|International) edition\b/gi, '')
      // Remove Guardian site header
      .replace(/\bThe Guardian - Back to home\b/gi, '')
      .replace(/\bShow more Hide expanded menu\b/gi, '')
      // Remove main menu sections
      .replace(/\bNews Opinion Sport Culture Lifestyle\b/gi, '')
      .replace(/\bFootball Newsletters Business Environment\b/gi, '')
      .replace(/\bNews View all News\b/gi, '')
      .replace(/\bUK news US politics World news Climate crisis Middle East Ukraine Football Newsletters Business Environment UK politics Science Tech Global development Obituaries\b/gi, '')
      .replace(/\bUK politics Science Tech Global development Obituaries\b/gi, '')
      .replace(/\bOpinion The Guardian view Columnists Cartoons Opinion videos Letters\b/gi, '')
      .replace(/\bSport Football Cricket Rugby union Tennis Cycling F1 Golf Boxing Rugby league Racing US sports\b/gi, '')
      .replace(/\bCulture Film Music TV & radio Arts Books Stage Classical Games Lifestyle Fashion Food Recipes Love & sex Family Travel Money\b/gi, '')
      // Remove common Guardian article patterns that appear in extracted text
      .replace(/\bThe Guardian\b/gi, '') // Remove repeated "The Guardian" mentions
      // Clean up extra whitespace and normalize
      .replace(/\s+/g, ' ')
      .trim();

    // Final cleanup: remove any remaining short navigation-like fragments
    const words = result.split(/\s+/);
    if (words.length < 20) {
      // If very short content remains, it might be mostly navigation
      return '';
    }

    return result;
  }  /**
   * Check if a line looks like navigation content
   */
  _isNavigationLine(line) {
    const lower = line.toLowerCase();

    // Common navigation patterns
    const navPatterns = [
      /^skip to/i,
      /^search/i,
      /^sign in/i,
      /^sign out/i,
      /^menu/i,
      /^navigation/i,
      /^home$/i,
      /^about$/i,
      /^contact$/i,
      /^privacy/i,
      /^terms/i,
      /^advertise/i,
      /^subscribe/i,
      /^newsletter/i,
      /^follow us/i,
      /^share/i,
      /^related/i,
      /^comments/i,
      /^tags/i,
      /^categories/i,
      /^\d+ comments?$/i,
      /^print$/i,
      /^email$/i,
      /^facebook$/i,
      /^twitter$/i,
      /^linkedin$/i,
      /^instagram$/i,
      /^youtube$/i
    ];

    // Check for navigation patterns
    if (navPatterns.some(pattern => pattern.test(lower))) {
      return true;
    }

    // Check for high link density (many short words that are likely menu items)
    const words = lower.split(/\s+/);
    if (words.length <= 5) {
      const shortWords = words.filter(word => word.length <= 3);
      if (shortWords.length >= words.length * 0.8) {
        return true; // Likely a menu bar
      }
    }

    // Check for repetitive separators or menu-like formatting
    if (/^[\|\-\s]+$/.test(line) || /^\w+$/.test(line)) {
      return true;
    }

    return false;
  }

  /**
   * Basic HTML stripping fallback with aggressive navigation filtering
   */
  _basicHtmlStrip(html) {
    // First do basic HTML tag removal
    let text = html
      .replace(/<[^>]*>/g, ' ') // Remove HTML tags
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();

    // Apply comprehensive navigation filtering
    text = this._filterNavigationContent(text);

    return text;
  }

  /**
   * Count words in text
   */
  _countWords(text) {
    if (!text) return 0;
    return text.trim().split(/\s+/).filter(word => word.length > 0).length;
  }

  /**
   * Extract article with extended metadata (ArticlePlus mode)
   *
   * Includes title, byline, publication date, and other metadata
   * in addition to the main article content.
   *
   * @param {string} html - Raw HTML content
   * @param {string} url - Source URL (for context)
   * @returns {Object} Extended extraction result
   */
  extractPlus(html, url = null) {
    if (!html || typeof html !== 'string') {
      return {
        success: false,
        text: '',
        wordCount: 0,
        metadata: {},
        error: 'Invalid HTML input'
      };
    }

    try {
      // Create DOM from HTML
      const dom = new JSDOM(html, {
        url: url || 'https://example.com',
        virtualConsole: this._createVirtualConsole()
      });

      // Extract additional metadata from HTML BEFORE removing navigation elements
      const extendedMetadata = this._extractExtendedMetadata(dom.window.document, null);

      // Remove navigation elements before processing
      this._removeNavigationElements(dom.window.document);

      // Run Readability extraction
      const reader = new Readability(dom.window.document, {
        debug: false,
        maxElemsToParse: 0, // No limit
        nbTopCandidates: 5,
        charThreshold: 500,
        classesToPreserve: []
      });

      const article = reader.parse();

      if (!article || !article.textContent) {
        return {
          success: false,
          text: '',
          wordCount: 0,
          metadata: extendedMetadata,
          error: 'No article content found'
        };
      }

      // Extract main article content
      let text = article.textContent.trim();
      text = text.replace(/\s+/g, ' '); // Normalize whitespace
      text = this._filterNavigationContent(text);

      const wordCount = this._countWords(text);

      // Validate minimum content requirements
      if (wordCount < this.options.minWordCount) {
        return {
          success: false,
          text: '',
          wordCount: 0,
          metadata: extendedMetadata,
          error: `Content too short (${wordCount} words, minimum ${this.options.minWordCount})`
        };
      }

      return {
        success: true,
        text,
        wordCount,
        metadata: {
          // Readability metadata
          title: article.title || null,
          excerpt: article.excerpt || null,
          byline: article.byline || null,
          siteName: article.siteName || null,
          language: article.language || null,
          // Extended metadata
          ...extendedMetadata
        }
      };

    } catch (error) {
      return {
        success: false,
        text: '',
        wordCount: 0,
        metadata: {},
        error: `Extraction failed: ${error.message}`
      };
    }
  }

  /**
   * Extract extended metadata from HTML document
   */
  _extractExtendedMetadata(document, readabilityArticle) {
    const metadata = {};

    // Extract publication date from various sources
    metadata.publicationDate = this._extractPublicationDate(document);

    // Extract author information (beyond Readability's byline)
    metadata.authors = this._extractAuthors(document, readabilityArticle);

    // Extract article metadata (category, tags, etc.)
    metadata.articleMeta = this._extractArticleMeta(document);

    // Extract social media handles or related links
    metadata.socialLinks = this._extractSocialLinks(document);

    return metadata;
  }

  /**
   * Extract publication date from HTML
   */
  _extractPublicationDate(document) {
    // Common date selectors and attributes
    const dateSelectors = [
      // JSON-LD structured data
      'script[type="application/ld+json"]',
      // Meta tags
      'meta[property="article:published_time"]',
      'meta[name="publishdate"]',
      'meta[name="publication-date"]',
      'meta[name="date"]',
      'meta[name="DC.date.issued"]',
      // Common class/ID patterns
      '.published-date',
      '.publish-date',
      '.article-date',
      '.post-date',
      '.entry-date',
      '.date-published',
      '.time',
      '[datetime]',
      // Guardian-specific
      '.dcr-1v0jxom', // Guardian date class
      // Generic time elements
      'time[datetime]',
      'time'
    ];

    // Try JSON-LD first
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const articles = Array.isArray(data) ? data : [data];
          for (const item of articles) {
            if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
              if (item.datePublished) {
                return new Date(item.datePublished).toISOString();
              }
            }
          }
        } catch (e) {
          // Continue to next script
        }
      }
    } catch (e) {
      // Continue with other methods
    }

    // Try meta tags
    for (const selector of dateSelectors.slice(1, 6)) {
      const element = document.querySelector(selector);
      if (element) {
        const dateStr = element.getAttribute('content') || element.getAttribute('datetime') || element.textContent;
        if (dateStr) {
          try {
            const date = new Date(dateStr.trim());
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    // Try time elements and date classes
    for (const selector of dateSelectors.slice(6)) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const dateStr = element.getAttribute('datetime') || element.textContent;
        if (dateStr) {
          try {
            const date = new Date(dateStr.trim());
            if (!isNaN(date.getTime())) {
              return date.toISOString();
            }
          } catch (e) {
            // Continue
          }
        }
      }
    }

    return null;
  }

  /**
   * Extract author information beyond Readability's byline
   */
  _extractAuthors(document, readabilityArticle) {
    const authors = [];

    // Start with Readability's byline if available
    if (readabilityArticle && readabilityArticle.byline) {
      // Split byline on common separators to handle multiple authors
      const bylineAuthors = readabilityArticle.byline.split(/[,;&]/).map(name => name.trim()).filter(name => name);
      for (const authorName of bylineAuthors) {
        if (authorName.length > 0) {
          authors.push({
            name: authorName,
            source: 'readability'
          });
        }
      }
    }

    // Extract from JSON-LD
    try {
      const jsonLdScripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of jsonLdScripts) {
        try {
          const data = JSON.parse(script.textContent);
          const articles = Array.isArray(data) ? data : [data];
          for (const item of articles) {
            if (item['@type'] === 'Article' || item['@type'] === 'NewsArticle') {
              if (item.author) {
                const articleAuthors = Array.isArray(item.author) ? item.author : [item.author];
                for (const author of articleAuthors) {
                  if (typeof author === 'string') {
                    authors.push({ name: author, source: 'json-ld' });
                  } else if (author.name) {
                    authors.push({ name: author.name, source: 'json-ld' });
                  }
                }
              }
            }
          }
        } catch (e) {
          // Continue
        }
      }
    } catch (e) {
      // Continue
    }

    // Extract from meta tags
    const authorSelectors = [
      'meta[name="author"]',
      'meta[property="article:author"]',
      'meta[name="DC.creator"]',
      '.author',
      '.byline',
      '.writer',
      '.contributor'
    ];

    for (const selector of authorSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const authorName = element.getAttribute('content') || element.textContent;
        if (authorName && authorName.trim().length > 0) {
          // Split on common separators for multiple authors
          const elementAuthors = authorName.split(/[,;&]/).map(name => name.trim()).filter(name => name);
          for (const name of elementAuthors) {
            if (name.length > 0) {
              authors.push({
                name: name,
                source: 'html-meta'
              });
            }
          }
        }
      }
    }

    // Remove duplicates
    const uniqueAuthors = [];
    const seen = new Set();
    for (const author of authors) {
      if (!seen.has(author.name.toLowerCase())) {
        uniqueAuthors.push(author);
        seen.add(author.name.toLowerCase());
      }
    }

    return uniqueAuthors;
  }

  /**
   * Extract article metadata (category, tags, etc.)
   */
  _extractArticleMeta(document) {
    const meta = {};

    // Extract category/section
    const categorySelectors = [
      'meta[property="article:section"]',
      'meta[name="category"]',
      'meta[name="section"]',
      '.article-category',
      '.category',
      '.section'
    ];

    for (const selector of categorySelectors) {
      const element = document.querySelector(selector);
      if (element) {
        const category = element.getAttribute('content') || element.textContent;
        if (category && category.trim()) {
          meta.category = category.trim();
          break;
        }
      }
    }

    // Extract tags/keywords
    const tagSelectors = [
      'meta[name="keywords"]',
      'meta[property="article:tag"]',
      'meta[name="news_keywords"]'
    ];

    const tags = [];
    for (const selector of tagSelectors) {
      const elements = document.querySelectorAll(selector);
      for (const element of elements) {
        const tagStr = element.getAttribute('content');
        if (tagStr) {
          const tagList = tagStr.split(',').map(t => t.trim()).filter(t => t);
          tags.push(...tagList);
        }
      }
    }

    if (tags.length > 0) {
      meta.tags = [...new Set(tags)]; // Remove duplicates
    }

    return meta;
  }

  /**
   * Extract social media links and handles
   */
  _extractSocialLinks(document) {
    const socialLinks = {};

    // Common social media platforms
    const platforms = {
      twitter: ['twitter.com', 'x.com'],
      facebook: ['facebook.com'],
      linkedin: ['linkedin.com'],
      instagram: ['instagram.com'],
      youtube: ['youtube.com']
    };

    // Find all links
    const links = document.querySelectorAll('a[href]');
    for (const link of links) {
      const href = link.getAttribute('href');
      if (!href) continue;

      try {
        const url = new URL(href, 'https://example.com');
        const hostname = url.hostname.toLowerCase();

        for (const [platform, domains] of Object.entries(platforms)) {
          if (domains.some(domain => hostname.includes(domain))) {
            if (!socialLinks[platform]) {
              socialLinks[platform] = [];
            }
            socialLinks[platform].push(href);
            break;
          }
        }
      } catch (e) {
        // Invalid URL, skip
      }
    }

    // Remove duplicates and limit to first few links per platform
    for (const platform in socialLinks) {
      socialLinks[platform] = [...new Set(socialLinks[platform])].slice(0, 3);
    }

    return socialLinks;
  }

  /**
   * Create a virtual console to suppress JSDOM warnings
   */
  _createVirtualConsole() {
    return new (require('jsdom').VirtualConsole)();
  }
}

module.exports = {
  HtmlArticleExtractor
};