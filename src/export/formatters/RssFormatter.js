'use strict';

/**
 * RSS 2.0 Formatter for data export
 * 
 * Generates valid RSS 2.0 feeds with:
 * - Proper XML escaping
 * - RFC 2822 date formatting
 * - Atom namespace for self-link
 * 
 * @see https://www.rssboard.org/rss-specification
 * @module RssFormatter
 */

/**
 * RSS 2.0 Formatter class
 */
class RssFormatter {
  /**
   * Create RSS Formatter
   * @param {Object} config - Feed configuration
   * @param {string} [config.feedTitle='News Feed'] - Feed title
   * @param {string} [config.feedDescription='Exported articles'] - Feed description
   * @param {string} [config.feedLink='http://localhost'] - Feed link
   * @param {string} [config.feedLanguage='en'] - Feed language
   */
  constructor(config = {}) {
    this.config = {
      feedTitle: config.feedTitle || 'News Feed',
      feedDescription: config.feedDescription || 'Exported articles from News Crawler',
      feedLink: config.feedLink || 'http://localhost',
      feedLanguage: config.feedLanguage || 'en',
      selfLink: config.selfLink || `${config.feedLink || 'http://localhost'}/api/v1/feed/rss`,
      generator: config.generator || 'News Crawler Export System',
      ttl: config.ttl || 60, // Time to live in minutes
      ...config
    };
  }

  /**
   * Format articles as RSS 2.0 feed
   * @param {Array} articles - Array of article objects
   * @param {Object} metadata - Export metadata
   * @returns {string} RSS 2.0 XML
   */
  format(articles, metadata = {}) {
    const items = Array.isArray(articles) ? articles : [];
    const buildDate = new Date().toUTCString();

    // Find latest article date for lastBuildDate
    let lastBuildDate = buildDate;
    if (items.length > 0) {
      const dates = items
        .map(a => a.published_at || a.fetched_at || a.publishedAt || a.fetchedAt)
        .filter(d => d)
        .map(d => new Date(d));
      if (dates.length > 0) {
        lastBuildDate = new Date(Math.max(...dates)).toUTCString();
      }
    }

    const xml = [
      '<?xml version="1.0" encoding="UTF-8"?>',
      '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
      '  <channel>',
      `    <title>${this.escapeXml(this.config.feedTitle)}</title>`,
      `    <link>${this.escapeXml(this.config.feedLink)}</link>`,
      `    <description>${this.escapeXml(this.config.feedDescription)}</description>`,
      `    <language>${this.escapeXml(this.config.feedLanguage)}</language>`,
      `    <lastBuildDate>${lastBuildDate}</lastBuildDate>`,
      `    <generator>${this.escapeXml(this.config.generator)}</generator>`,
      `    <ttl>${this.config.ttl}</ttl>`,
      `    <atom:link href="${this.escapeXml(this.config.selfLink)}" rel="self" type="application/rss+xml"/>`,
      ...items.map(article => this.formatItem(article)),
      '  </channel>',
      '</rss>'
    ];

    return xml.join('\n');
  }

  /**
   * Format a single article as RSS item
   * @param {Object} article - Article object
   * @returns {string} RSS item XML
   */
  formatItem(article) {
    const title = article.title || 'Untitled';
    const link = article.url || article.link || '';
    const description = this.truncateDescription(
      article.body_text || article.description || article.summary || ''
    );
    const pubDate = this.formatRfc2822Date(
      article.published_at || article.fetched_at || article.publishedAt || article.fetchedAt
    );
    const guid = article.url || article.id || `article-${Date.now()}`;
    const author = article.byline || article.author || '';
    const category = article.category || '';

    const itemLines = [
      '    <item>',
      `      <title>${this.escapeXml(title)}</title>`,
      `      <link>${this.escapeXml(link)}</link>`,
      `      <description>${this.escapeXml(description)}</description>`,
      `      <pubDate>${pubDate}</pubDate>`,
      `      <guid isPermaLink="${link ? 'true' : 'false'}">${this.escapeXml(guid)}</guid>`
    ];

    if (author) {
      itemLines.push(`      <author>${this.escapeXml(author)}</author>`);
    }

    if (category) {
      itemLines.push(`      <category>${this.escapeXml(category)}</category>`);
    }

    itemLines.push('    </item>');

    return itemLines.join('\n');
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
   * Format date as RFC 2822
   * RSS 2.0 requires dates in RFC 2822 format
   * @param {string|Date} date - Date to format
   * @returns {string} RFC 2822 formatted date
   */
  formatRfc2822Date(date) {
    if (!date) {
      return new Date().toUTCString();
    }

    try {
      const d = date instanceof Date ? date : new Date(date);
      if (isNaN(d.getTime())) {
        return new Date().toUTCString();
      }
      return d.toUTCString();
    } catch {
      return new Date().toUTCString();
    }
  }

  /**
   * Truncate description to reasonable length
   * @param {string} text - Text to truncate
   * @param {number} maxLength - Maximum length (default: 500)
   * @returns {string} Truncated text
   */
  truncateDescription(text, maxLength = 500) {
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
    return 'application/rss+xml; charset=utf-8';
  }
}

module.exports = {
  RssFormatter
};
