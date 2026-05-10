'use strict';

/**
 * Atom 1.0 Formatter for data export
 * 
 * Generates valid Atom 1.0 feeds with:
 * - Proper XML escaping
 * - ISO 8601 date formatting
 * - UUID-based feed IDs
 * 
 * @see https://validator.w3.org/feed/docs/atom.html
 * @module AtomFormatter
 */

const crypto = require('crypto');

/**
 * Atom 1.0 Formatter class
 */
class AtomFormatter {
  /**
   * Create Atom Formatter
   * @param {Object} config - Feed configuration
   * @param {string} [config.feedTitle='News Feed'] - Feed title
   * @param {string} [config.feedSubtitle] - Feed subtitle/description
   * @param {string} [config.feedLink='http://localhost'] - Feed link
   * @param {string} [config.feedId] - Feed ID (defaults to URN UUID)
   * @param {string} [config.authorName] - Default author name
   */
  constructor(config = {}) {
    this.config = {
      feedTitle: config.feedTitle || 'News Feed',
      feedSubtitle: config.feedSubtitle || config.feedDescription || 'Exported articles from News Crawler',
      feedLink: config.feedLink || 'http://localhost',
      selfLink: config.selfLink || `${config.feedLink || 'http://localhost'}/api/v1/feed/atom`,
      feedId: config.feedId || this.generateFeedId(config.feedLink || 'http://localhost'),
      authorName: config.authorName || 'News Crawler',
      generator: config.generator || 'News Crawler Export System',
      generatorVersion: config.generatorVersion || '1.0.0',
      ...config
    };
  }

  /**
   * Format articles as Atom 1.0 feed
   * @param {Array} articles - Array of article objects
   * @param {Object} metadata - Export metadata
   * @returns {string} Atom 1.0 XML
   */
  format(articles, metadata = {}) {
    const entries = Array.isArray(articles) ? articles : [];
    const updated = new Date().toISOString();

    // Find latest article date
    let lastUpdated = updated;
    if (entries.length > 0) {
      const dates = entries
        .map(a => a.published_at || a.fetched_at || a.publishedAt || a.fetchedAt)
        .filter(d => d)
        .map(d => new Date(d));
      if (dates.length > 0) {
        lastUpdated = new Date(Math.max(...dates)).toISOString();
      }
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<feed xmlns="http://www.w3.org/2005/Atom">',
      `  <title>${this.escapeXml(this.config.feedTitle)}</title>`,
      this.config.feedSubtitle ? `  <subtitle>${this.escapeXml(this.config.feedSubtitle)}</subtitle>` : null,
      `  <link href="${this.escapeXml(this.config.feedLink)}" rel="alternate"/>`,
      `  <link href="${this.escapeXml(this.config.selfLink)}" rel="self"/>`,
      `  <updated>${lastUpdated}</updated>`,
      `  <id>${this.escapeXml(this.config.feedId)}</id>`,
      `  <generator version="${this.config.generatorVersion}">${this.escapeXml(this.config.generator)}</generator>`,
      this.config.authorName ? `  <author><name>${this.escapeXml(this.config.authorName)}</name></author>` : null,
      ...entries.map(article => this.formatEntry(article)),
      '</feed>'
    ].filter(Boolean);

    return xml.join('\n');
  }

  /**
   * Format a single article as Atom entry
   * @param {Object} article - Article object
   * @returns {string} Atom entry XML
   */
  formatEntry(article) {
    const title = article.title || 'Untitled';
    const link = article.url || article.link || '';
    const id = this.generateEntryId(article);
    const updated = this.formatIso8601Date(
      article.published_at || article.fetched_at || article.publishedAt || article.fetchedAt
    );
    const published = article.published_at || article.publishedAt
      ? this.formatIso8601Date(article.published_at || article.publishedAt)
      : null;
    const summary = this.truncateSummary(
      article.body_text || article.description || article.summary || ''
    );
    const author = article.byline || article.author || '';
    const category = article.category || '';

    const entryLines = [
      '  <entry>',
      `    <title>${this.escapeXml(title)}</title>`,
      `    <link href="${this.escapeXml(link)}"/>`,
      `    <id>${this.escapeXml(id)}</id>`,
      `    <updated>${updated}</updated>`
    ];

    if (published) {
      entryLines.push(`    <published>${published}</published>`);
    }

    if (summary) {
      entryLines.push(`    <summary>${this.escapeXml(summary)}</summary>`);
    }

    if (author) {
      entryLines.push(`    <author><name>${this.escapeXml(author)}</name></author>`);
    }

    if (category) {
      entryLines.push(`    <category term="${this.escapeXml(category)}"/>`);
    }

    entryLines.push('  </entry>');

    return entryLines.join('\n');
  }

  /**
   * Generate a unique feed ID
   * @param {string} feedLink - Feed link for ID generation
   * @returns {string} URN UUID
   */
  generateFeedId(feedLink) {
    const hash = crypto.createHash('sha256')
      .update(feedLink)
      .digest('hex')
      .substring(0, 32);

    // Format as UUID
    return `urn:uuid:${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
  }

  /**
   * Generate a unique entry ID
   * @param {Object} article - Article object
   * @returns {string} Entry ID (preferably URL, fallback to URN)
   */
  generateEntryId(article) {
    // Use URL if available
    if (article.url || article.link) {
      return article.url || article.link;
    }

    // Generate URN from content hash
    const content = `${article.id || ''}-${article.title || ''}-${article.published_at || ''}`;
    const hash = crypto.createHash('sha256')
      .update(content)
      .digest('hex')
      .substring(0, 32);

    return `urn:uuid:${hash.substring(0, 8)}-${hash.substring(8, 12)}-${hash.substring(12, 16)}-${hash.substring(16, 20)}-${hash.substring(20, 32)}`;
  }

  /**
   * Escape XML special characters
   * @param {string} str - String to escape
   * @returns {string} Escaped string
   */
  escapeXml(str) {
    if (str === null || str === undefined) {
      return '';
    }

    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&apos;');
  }

  /**
   * Format date as ISO 8601
   * Atom requires dates in ISO 8601 format
   * @param {string|Date} date - Date to format
   * @returns {string} ISO 8601 formatted date
   */
  formatIso8601Date(date) {
    if (!date) {
      return new Date().toISOString();
    }

    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) {
        return new Date().toISOString();
      }
      return d.toISOString();
    } catch {
      return new Date().toISOString();
    }
  }

  /**
   * Truncate summary to reasonable length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length (default: 500)
   * @returns {string} Truncated text
   */
  truncateSummary(text, maxLength = 500) {
    if (!text) return '';

    const str = String(text).trim();
    if (str.length <= maxLength) {
      return str;
    }

    // Truncate at word boundary
    const truncated = str.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(' ');
    if (lastSpace > maxLength * 0.8) {
      return truncated.substring(0, lastSpace) + '...';
    }
    return truncated + '...';
  }

  /**
   * Get content type
   * @returns {string} Content-Type header
   */
  getContentType() {
    return 'application/atom+xml; charset=utf-8';
  }
}

module.exports = {
  AtomFormatter
};
