#!/usr/bin/env node

/**
 * Article XPath Analyzer
 *
 * Analyzes HTML structure to identify XPath patterns for article content extraction.
 * This tool helps discover reusable patterns for fast article extraction from websites.
 *
 * Usage:
 *   node tools/xpath-analyzer.js <article-id> [--url <url>] [--limit <n>] [--verbose]
 *   node tools/xpath-analyzer.js --file <html-file> [--limit <n>] [--verbose]
 *   node tools/xpath-analyzer.js --stdin [--limit <n>] [--verbose]
 *
 * Examples:
 *   node tools/xpath-analyzer.js 12345
 *   node tools/xpath-analyzer.js --file article.html --limit 5
 *   cat article.html | node tools/xpath-analyzer.js --stdin
 */

const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

// Configuration
const DEFAULT_LIMIT = 10;
const MIN_CONTENT_LENGTH = 100;
const MAX_XPATH_DEPTH = 5;

class ArticleXPathAnalyzer {
  constructor(options = {}) {
    this.options = {
      limit: DEFAULT_LIMIT,
      verbose: false,
      minContentLength: MIN_CONTENT_LENGTH,
      maxDepth: MAX_XPATH_DEPTH,
      ...options
    };
  }

  /**
   * Main analysis function
   */
  async analyze(html, url = null) {
    const dom = new JSDOM(html, { url: url || 'https://example.com' });
    const document = dom.window.document;

    // Find candidate containers
    const candidates = this.findArticleCandidates(document);

    // Score and rank candidates
    const scoredCandidates = this.scoreCandidates(candidates, document);

    // Generate XPath patterns
    const xpathPatterns = this.generateXPathPatterns(scoredCandidates);

    return {
      totalCandidates: candidates.length,
      topPatterns: xpathPatterns.slice(0, this.options.limit),
      analysis: {
        documentTitle: document.title,
        bodyTextLength: document.body?.textContent?.length || 0,
        elementCount: document.querySelectorAll('*').length
      }
    };
  }

  /**
   * Find potential article content containers
   */
  findArticleCandidates(document) {
    const candidates = [];

    // Common article container selectors
    const selectors = [
      // Semantic HTML5
      'article',
      'main',
      '[role="main"]',
      // Common class/ID patterns
      '.article',
      '.content',
      '.post',
      '.entry',
      '.story',
      '#content',
      '#main',
      '#article',
      // News-specific patterns
      '.article-body',
      '.story-body',
      '.news-content',
      '.article-content',
      // Generic content containers
      '.container',
      '.wrapper',
      '.page-content'
    ];

    // Find elements matching selectors
    selectors.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          candidates.push({
            element,
            selector,
            xpath: this.getXPath(element),
            depth: this.getDepth(element)
          });
        });
      } catch (error) {
        // Ignore invalid selectors
      }
    });

    // Also consider large text blocks (fallback for sites without semantic markup)
    const allElements = document.querySelectorAll('*');
    allElements.forEach(element => {
      const textLength = element.textContent?.trim().length || 0;
      if (textLength > this.options.minContentLength) {
        // Check if this element has substantial text content
        const hasTextContent = this.hasSubstantialTextContent(element);
        if (hasTextContent) {
          candidates.push({
            element,
            selector: 'text-block',
            xpath: this.getXPath(element),
            depth: this.getDepth(element),
            textLength
          });
        }
      }
    });

    // Remove duplicates based on XPath
    const uniqueCandidates = [];
    const seenXPaths = new Set();

    candidates.forEach(candidate => {
      if (!seenXPaths.has(candidate.xpath)) {
        seenXPaths.add(candidate.xpath);
        uniqueCandidates.push(candidate);
      }
    });

    return uniqueCandidates;
  }

  /**
   * Score candidates based on content quality and structure
   */
  scoreCandidates(candidates, document) {
    return candidates.map(candidate => {
      const { element } = candidate;
      let score = 0;
      const reasons = [];

      // Content length scoring
      const textLength = element.textContent?.trim().length || 0;
      if (textLength > 1000) {
        score += 30;
        reasons.push('long-content');
      } else if (textLength > 500) {
        score += 20;
        reasons.push('medium-content');
      } else if (textLength > 200) {
        score += 10;
        reasons.push('short-content');
      }

      // Semantic HTML bonus
      if (element.tagName === 'ARTICLE') {
        score += 25;
        reasons.push('semantic-article');
      } else if (element.tagName === 'MAIN') {
        score += 20;
        reasons.push('semantic-main');
      } else if (element.matches('[role="main"]')) {
        score += 20;
        reasons.push('role-main');
      }

      // Class/ID pattern bonuses
      const className = element.className || '';
      const id = element.id || '';

      if (/\b(article|content|story|post|entry)\b/i.test(className) ||
          /\b(article|content|story|post|entry)\b/i.test(id)) {
        score += 15;
        reasons.push('content-class');
      }

      // Structure bonuses
      const paragraphCount = element.querySelectorAll('p').length;
      if (paragraphCount > 3) {
        score += 10;
        reasons.push('many-paragraphs');
      }

      // Heading structure bonus
      const headingCount = element.querySelectorAll('h1, h2, h3, h4, h5, h6').length;
      if (headingCount > 0) {
        score += 5;
        reasons.push('has-headings');
      }

      // Penalize navigation-like content
      const linkDensity = this.calculateLinkDensity(element);
      if (linkDensity > 0.3) {
        score -= 15;
        reasons.push('high-link-density');
      }

      // Penalize very deep nesting
      if (candidate.depth > 8) {
        score -= 10;
        reasons.push('deep-nesting');
      }

      // Penalize very shallow content
      if (textLength < 100) {
        score -= 20;
        reasons.push('insufficient-content');
      }

      return {
        ...candidate,
        score,
        reasons,
        textLength,
        paragraphCount,
        headingCount,
        linkDensity: linkDensity.toFixed(3)
      };
    }).sort((a, b) => b.score - a.score);
  }

  /**
   * Generate XPath patterns from scored candidates
   */
  generateXPathPatterns(scoredCandidates) {
    return scoredCandidates.map(candidate => {
      const { element, xpath, score, reasons, textLength, paragraphCount, headingCount, linkDensity } = candidate;

      // Generate alternative XPath patterns
      const patterns = [xpath];

      // Try to create more robust patterns
      if (element.className) {
        const classSelector = `.${element.className.trim().split(/\s+/).join('.')}`;
        patterns.push(`//${element.tagName.toLowerCase()}${classSelector}`);
      }

      if (element.id) {
        patterns.push(`//*[@id="${element.id}"]`);
      }

      // Generate position-independent patterns
      const pathParts = xpath.split('/').filter(part => part && part !== 'html' && part !== 'body');
      if (pathParts.length > 1) {
        // Try ancestor patterns
        for (let i = 1; i < pathParts.length; i++) {
          const ancestorPath = '//' + pathParts.slice(-i).join('/');
          patterns.push(ancestorPath);
        }
      }

      return {
        xpath,
        alternativePatterns: patterns.slice(1), // Exclude the primary XPath
        score,
        confidence: this.calculateConfidence(score),
        reasons,
        stats: {
          textLength,
          paragraphCount,
          headingCount,
          linkDensity: parseFloat(linkDensity)
        },
        preview: this.getTextPreview(element, 100)
      };
    });
  }

  /**
   * Calculate confidence score (0-1)
   */
  calculateConfidence(score) {
    // Normalize score to 0-1 range (assuming max score around 100)
    return Math.min(score / 100, 1);
  }

  /**
   * Get XPath for an element
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
      if (current && current.tagName === 'HTML') break;
    }

    return '/' + parts.join('/');
  }

  /**
   * Get depth of element in DOM
   */
  getDepth(element) {
    let depth = 0;
    let current = element;

    while (current && current.parentNode && current.tagName !== 'HTML') {
      depth++;
      current = current.parentNode;
    }

    return depth;
  }

  /**
   * Check if element has substantial text content
   */
  hasSubstantialTextContent(element) {
    const text = element.textContent || '';
    const words = text.trim().split(/\s+/).filter(word => word.length > 0);

    // Must have reasonable word count
    if (words.length < 20) return false;

    // Must not be mostly links
    const linkText = element.textContent.match(/https?:\/\//g) || [];
    if (linkText.length > words.length * 0.5) return false;

    return true;
  }

  /**
   * Calculate link density
   */
  calculateLinkDensity(element) {
    const totalText = element.textContent?.trim().length || 0;
    if (totalText === 0) return 0;

    const linkElements = element.querySelectorAll('a');
    let linkTextLength = 0;

    linkElements.forEach(link => {
      linkTextLength += link.textContent?.trim().length || 0;
    });

    return linkTextLength / totalText;
  }

  /**
   * Get text preview
   */
  getTextPreview(element, maxLength = 100) {
    const text = element.textContent?.trim() || '';
    if (text.length <= maxLength) return text;

    return text.substring(0, maxLength - 3) + '...';
  }
}

/**
 * CLI Interface
 */
async function main() {
  const args = process.argv.slice(2);
  let html = null;
  let url = null;
  let limit = DEFAULT_LIMIT;
  let verbose = false;

  // Parse arguments
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    switch (arg) {
      case '--file':
        if (i + 1 < args.length) {
          const filePath = args[i + 1];
          try {
            html = fs.readFileSync(filePath, 'utf8');
            i++;
          } catch (error) {
            console.error(`Error reading file ${filePath}:`, error.message);
            process.exit(1);
          }
        }
        break;

      case '--stdin':
        html = fs.readFileSync(0, 'utf8');
        break;

      case '--url':
        if (i + 1 < args.length) {
          url = args[i + 1];
          i++;
        }
        break;

      case '--limit':
        if (i + 1 < args.length) {
          limit = parseInt(args[i + 1], 10) || DEFAULT_LIMIT;
          i++;
        }
        break;

      case '--verbose':
        verbose = true;
        break;

      case '--help':
      case '-h':
        showHelp();
        process.exit(0);
        break;

      default:
        // Check if it's an article ID
        if (!isNaN(parseInt(arg, 10)) && !html) {
          // This would need database access to fetch article HTML
          console.error('Article ID lookup not implemented yet. Use --file or --stdin.');
          process.exit(1);
        }
        break;
    }
  }

  if (!html) {
    console.error('No HTML input provided. Use --file <path>, --stdin, or provide article ID.');
    showHelp();
    process.exit(1);
  }

  try {
    const analyzer = new ArticleXPathAnalyzer({ limit, verbose });
    const result = await analyzer.analyze(html, url);

    // Output results
    console.log('🔍 Article XPath Analysis');
    console.log('=' .repeat(50));

    if (verbose) {
      console.log(`📄 Document: ${result.analysis.documentTitle}`);
      console.log(`📊 Elements: ${result.analysis.elementCount.toLocaleString()}`);
      console.log(`📝 Text Length: ${result.analysis.bodyTextLength.toLocaleString()}`);
      console.log(`🎯 Candidates Found: ${result.totalCandidates}`);
      console.log('');
    }

    console.log(`🏆 Top ${result.topPatterns.length} XPath Patterns:`);
    console.log('');

    result.topPatterns.forEach((pattern, index) => {
      const confidencePercent = Math.round(pattern.confidence * 100);
      const confidenceBar = '█'.repeat(Math.round(confidencePercent / 10)) + '░'.repeat(10 - Math.round(confidencePercent / 10));

      console.log(`${index + 1}. ${confidenceBar} ${confidencePercent}%`);
      console.log(`   XPath: ${pattern.xpath}`);
      console.log(`   Score: ${pattern.score}`);

      if (pattern.alternativePatterns.length > 0) {
        console.log(`   Alternatives: ${pattern.alternativePatterns.slice(0, 2).join(', ')}`);
      }

      if (verbose) {
        console.log(`   Reasons: ${pattern.reasons.join(', ')}`);
        console.log(`   Stats: ${pattern.stats.textLength} chars, ${pattern.stats.paragraphCount} paras, ${pattern.stats.headingCount} headings`);
        console.log(`   Preview: "${pattern.preview}"`);
      }

      console.log('');
    });

    if (result.topPatterns.length === 0) {
      console.log('❌ No suitable article content containers found.');
      console.log('   The HTML may not contain identifiable article content.');
    }

  } catch (error) {
    console.error('❌ Analysis failed:', error.message);
    if (verbose) {
      console.error(error.stack);
    }
    process.exit(1);
  }
}

function showHelp() {
  console.log(`
Article XPath Analyzer

Analyzes HTML structure to identify XPath patterns for article content extraction.

USAGE:
  node tools/xpath-analyzer.js <article-id> [--url <url>] [--limit <n>] [--verbose]
  node tools/xpath-analyzer.js --file <html-file> [--limit <n>] [--verbose]
  node tools/xpath-analyzer.js --stdin [--limit <n>] [--verbose]

OPTIONS:
  --file <path>     Read HTML from file
  --stdin           Read HTML from stdin
  --url <url>       Source URL for context
  --limit <n>       Number of patterns to show (default: 10)
  --verbose         Show detailed analysis and previews
  --help, -h        Show this help

EXAMPLES:
  node tools/xpath-analyzer.js --file article.html
  cat article.html | node tools/xpath-analyzer.js --stdin --limit 5
  node tools/xpath-analyzer.js --file article.html --verbose

OUTPUT:
  Shows XPath patterns ranked by confidence score, with alternative patterns
  and content statistics. Use these patterns for fast article extraction.
`);
}

if (require.main === module) {
  main().catch(error => {
    console.error('Unexpected error:', error);
    process.exit(1);
  });
}

module.exports = {
  ArticleXPathAnalyzer
};