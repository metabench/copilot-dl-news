'use strict';

/**
 * ArticleViewerControl
 * 
 * A jsgui3 control for displaying extracted article content in a clean,
 * readable format. Takes downloaded HTML, extracts the main content using
 * Readability, and composes it with proper typography and metadata.
 * 
 * Features:
 * - Clean article composition with title, byline, date, and body
 * - Metadata panel showing extraction confidence, word count, etc.
 * - Links back to original URL and fetch details
 * - Responsive design with readable line lengths
 * 
 * @example
 * const control = new ArticleViewerControl({
 *   context: ctx,
 *   article: {
 *     url: 'https://example.com/article',
 *     fetchId: 12345,
 *     title: 'Article Title',
 *     byline: 'By Author Name',
 *     publishedDate: '2026-01-06',
 *     extraction: { success: true, text: '...', wordCount: 500 }
 *   }
 * });
 */

const jsgui = require('jsgui3-html');
const { addText, makeTextEl, makeLink } = require('../server/utils/jsgui3Helpers');

/**
 * Format a date for display
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return null;
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return String(date);
    return d.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric'
    });
  } catch {
    return String(date);
  }
}

/**
 * Format confidence score as percentage with color
 * @param {number} score - Confidence score (0-1)
 * @returns {Object} { text, color }
 */
function formatConfidence(score) {
  if (score == null) return { text: 'N/A', color: '#888' };
  const pct = Math.round(score * 100);
  let color = '#888';
  if (pct >= 80) color = '#22c55e';
  else if (pct >= 60) color = '#84cc16';
  else if (pct >= 40) color = '#eab308';
  else color = '#ef4444';
  return { text: `${pct}%`, color };
}

/**
 * Format word count with K suffix for large numbers
 * @param {number} count - Word count
 * @returns {string} Formatted word count
 */
function formatWordCount(count) {
  if (count == null) return 'N/A';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

class ArticleViewerControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._article = spec.article || {};
    this._basePath = spec.basePath || '';
    this._showRawHtml = spec.showRawHtml || false;
    this._showMetadata = spec.showMetadata !== false;
    
    // SSR: call compose immediately
    this.compose();
  }

  compose() {
    const article = this._article;
    const extraction = article.extraction || {};

    // Main container with article styling
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '24px',
        fontFamily: 'Georgia, serif',
        color: '#1a1a1a',
        lineHeight: '1.7',
        backgroundColor: '#fafafa'
      }
    }));

    // Navigation / back link
    this._composeNavigation(container);

    // Metadata bar (classification, confidence, word count)
    if (this._showMetadata) {
      this._composeMetadataBar(container);
    }

    // Article header (title, byline, date)
    this._composeHeader(container);

    // Article body content
    if (extraction.success) {
      this._composeBody(container, extraction);
    } else {
      this._composeError(container, extraction);
    }

    // Footer with source links
    this._composeFooter(container);
  }

  _composeNavigation(container) {
    const nav = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'nav',
      style: {
        marginBottom: '24px',
        paddingBottom: '16px',
        borderBottom: '1px solid #e0e0e0',
        fontSize: '14px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
      }
    }));

    // Back to articles link
    nav.add(makeLink(this.context, '← Back to Articles', `${this._basePath}/articles`, {
      color: '#2563eb',
      textDecoration: 'none',
      marginRight: '24px'
    }));

    // Link to fetch details
    if (this._article.fetchId) {
      nav.add(makeLink(this.context, 'View Fetch Details', `${this._basePath}/fetches/${this._article.fetchId}`, {
        color: '#6b7280',
        textDecoration: 'none',
        marginRight: '24px'
      }));
    }

    // Link to URL details
    if (this._article.urlId) {
      nav.add(makeLink(this.context, 'View URL History', `${this._basePath}/urls/${this._article.urlId}`, {
        color: '#6b7280',
        textDecoration: 'none'
      }));
    }
  }

  _composeMetadataBar(container) {
    const article = this._article;
    const bar = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        padding: '12px 16px',
        backgroundColor: '#f3f4f6',
        borderRadius: '8px',
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif'
      }
    }));

    // Classification badge
    if (article.classification) {
      const badge = bar.add(new jsgui.Control({
        context: this.context,
        tagName: 'span',
        style: {
          padding: '4px 10px',
          backgroundColor: '#e0e7ff',
          color: '#3730a3',
          borderRadius: '12px',
          fontWeight: '500'
        }
      }));
      addText(this.context, badge, article.classification);
    }

    // Confidence score
    if (article.confidenceScore != null) {
      const conf = formatConfidence(article.confidenceScore);
      const confEl = bar.add(new jsgui.Control({
        context: this.context,
        tagName: 'span',
        style: { color: '#4b5563' }
      }));
      addText(this.context, confEl, `Confidence: `);
      const confValue = confEl.add(new jsgui.Control({
        context: this.context,
        tagName: 'strong',
        style: { color: conf.color }
      }));
      addText(this.context, confValue, conf.text);
    }

    // Word count
    const wordCount = article.extraction?.wordCount || article.wordCount;
    if (wordCount != null) {
      const wcEl = bar.add(new jsgui.Control({
        context: this.context,
        tagName: 'span',
        style: { color: '#4b5563' }
      }));
      addText(this.context, wcEl, `${formatWordCount(wordCount)} words`);
    }

    // Host
    if (article.host) {
      const hostEl = bar.add(makeLink(this.context, article.host, `${this._basePath}/domains/${article.host}`, {
        color: '#6b7280',
        textDecoration: 'none'
      }));
    }

    // Section
    if (article.section) {
      const secEl = bar.add(new jsgui.Control({
        context: this.context,
        tagName: 'span',
        style: { color: '#9ca3af' }
      }));
      addText(this.context, secEl, `Section: ${article.section}`);
    }
  }

  _composeHeader(container) {
    const article = this._article;
    const extraction = article.extraction || {};

    const header = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'header',
      style: { marginBottom: '32px' }
    }));

    // Article title
    const title = extraction.title || article.title || 'Untitled Article';
    header.add(makeTextEl(this.context, 'h1', title, {
      style: {
        fontSize: '2.25rem',
        fontWeight: '700',
        lineHeight: '1.2',
        marginBottom: '16px',
        color: '#111827'
      }
    }));

    // Byline container
    const bylineContainer = header.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        fontSize: '16px',
        color: '#4b5563',
        marginBottom: '8px'
      }
    }));

    // Author / byline
    const byline = extraction.byline || article.byline || article.authors;
    if (byline) {
      const bylineEl = bylineContainer.add(new jsgui.Control({
        context: this.context,
        tagName: 'span',
        style: { fontStyle: 'italic' }
      }));
      addText(this.context, bylineEl, byline);
    }

    // Published date
    const dateStr = formatDate(article.publishedDate);
    if (dateStr) {
      if (byline) {
        bylineContainer.add(makeTextEl(this.context, 'span', ' · ', {
          style: { margin: '0 8px', color: '#9ca3af' }
        }));
      }
      bylineContainer.add(makeTextEl(this.context, 'time', dateStr, {
        style: { color: '#6b7280' }
      }));
    }

    // Excerpt (if available and different from body start)
    const excerpt = extraction.excerpt;
    if (excerpt && excerpt.length > 20) {
      header.add(makeTextEl(this.context, 'p', excerpt, {
        style: {
          fontSize: '1.25rem',
          color: '#4b5563',
          fontStyle: 'italic',
          borderLeft: '4px solid #e5e7eb',
          paddingLeft: '16px',
          marginTop: '16px'
        }
      }));
    }
  }

  _composeBody(container, extraction) {
    const body = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'article',
      attr: { class: 'article-body' },
      style: {
        fontSize: '18px',
        lineHeight: '1.8'
      }
    }));

    // Split text into paragraphs
    const text = extraction.text || '';
    const paragraphs = text.split(/\n\n+/).filter(p => p.trim().length > 0);

    if (paragraphs.length === 0) {
      body.add(makeTextEl(this.context, 'p', 'No article content extracted.', {
        style: { color: '#9ca3af', fontStyle: 'italic' }
      }));
      return;
    }

    // Render each paragraph
    for (const para of paragraphs) {
      // Check if it looks like a heading (short, no period at end)
      const isHeading = para.length < 100 && !para.endsWith('.') && !para.endsWith('?') && !para.endsWith('!');
      
      if (isHeading && para.length < 60) {
        body.add(makeTextEl(this.context, 'h2', para.trim(), {
          style: {
            fontSize: '1.5rem',
            fontWeight: '600',
            marginTop: '32px',
            marginBottom: '16px',
            color: '#1f2937'
          }
        }));
      } else {
        body.add(makeTextEl(this.context, 'p', para.trim(), {
          style: {
            marginBottom: '20px',
            textAlign: 'justify'
          }
        }));
      }
    }
  }

  _composeError(container, extraction) {
    const error = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        padding: '24px',
        backgroundColor: '#fef2f2',
        borderRadius: '8px',
        border: '1px solid #fecaca',
        marginBottom: '24px'
      }
    }));

    error.add(makeTextEl(this.context, 'h3', '⚠️ Extraction Failed', {
      style: { color: '#b91c1c', marginBottom: '8px', fontFamily: 'sans-serif' }
    }));

    const errorMsg = extraction.error || 'Unable to extract article content';
    error.add(makeTextEl(this.context, 'p', errorMsg, {
      style: { color: '#7f1d1d', fontFamily: 'sans-serif' }
    }));

    // Offer to view raw HTML
    if (this._article.fetchId) {
      error.add(makeLink(this.context, 'View raw content', `${this._basePath}/fetches/${this._article.fetchId}`, {
        color: '#2563eb',
        textDecoration: 'underline',
        fontFamily: 'sans-serif'
      }));
    }
  }

  _composeFooter(container) {
    const article = this._article;

    const footer = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'footer',
      style: {
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid #e5e7eb',
        fontSize: '13px',
        fontFamily: '-apple-system, BlinkMacSystemFont, sans-serif',
        color: '#6b7280'
      }
    }));

    // Source info
    const source = footer.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { marginBottom: '12px' }
    }));
    addText(this.context, source, 'Original source: ');
    source.add(makeLink(this.context, article.url || 'Unknown', article.url, {
      color: '#2563eb',
      textDecoration: 'none',
      wordBreak: 'break-all'
    }));

    // Crawl info
    if (article.fetchedAt) {
      const crawlInfo = footer.add(new jsgui.Control({
        context: this.context,
        tagName: 'div'
      }));
      const fetchDate = new Date(article.fetchedAt).toLocaleString();
      addText(this.context, crawlInfo, `Downloaded: ${fetchDate}`);
    }

    // Site name from extraction
    const siteName = article.extraction?.siteName;
    if (siteName) {
      const siteInfo = footer.add(new jsgui.Control({
        context: this.context,
        tagName: 'div'
      }));
      addText(this.context, siteInfo, `Site: ${siteName}`);
    }
  }
}

module.exports = { ArticleViewerControl };
