'use strict';

const jsgui = require('jsgui3-html');
const { addText, makeTextEl, makeLink } = require('../../shared/utils/jsgui3Helpers');

/**
 * ArticleViewerControl - Renders extracted article content in a clean, readable format
 * 
 * This control displays articles that have been extracted from downloaded pages using
 * Mozilla Readability. It shows the title, author, byline, date, and main content
 * in a simplified, distraction-free reading view.
 * 
 * @example
 * const viewer = new ArticleViewerControl({
 *   context: ctx,
 *   article: {
 *     title: 'Article Title',
 *     byline: 'By John Doe',
 *     date: '2026-01-06',
 *     url: 'https://example.com/article',
 *     siteName: 'Example News',
 *     textContent: 'Article body text...',
 *     content: '<p>Article HTML content...</p>',
 *     wordCount: 1500
 *   }
 * });
 */
class ArticleViewerControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._article = spec.article || {};
    this._showHtml = spec.showHtml || false; // Whether to render HTML or plain text
    this._basePath = spec.basePath || '';
  }

  compose() {
    const ctx = this.context;
    const article = this._article;

    // Main container with reading-optimized styles
    const container = this.add(new jsgui.Control({
      context: ctx,
      tagName: 'article',
      style: {
        maxWidth: '720px',
        margin: '0 auto',
        padding: '32px 24px',
        fontFamily: 'Georgia, "Times New Roman", serif',
        lineHeight: '1.8',
        color: '#1a1a1a',
        background: '#fefefe'
      }
    }));

    // Navigation bar
    this._renderNavBar(container);

    // Article header
    this._renderHeader(container);

    // Article metadata
    this._renderMetadata(container);

    // Article content
    this._renderContent(container);

    // Footer with source link
    this._renderFooter(container);
  }

  _renderNavBar(container) {
    const ctx = this.context;
    
    const nav = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'nav',
      style: {
        display: 'flex',
        gap: '16px',
        marginBottom: '32px',
        paddingBottom: '16px',
        borderBottom: '1px solid #e5e5e5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px'
      }
    }));

    nav.add(makeLink(ctx, '← Back to list', this._basePath || '/', {
      color: '#0066cc',
      textDecoration: 'none'
    }));

    if (this._article.url) {
      nav.add(makeLink(ctx, 'View original', this._article.url, {
        color: '#0066cc',
        textDecoration: 'none'
      }));
    }
  }

  _renderHeader(container) {
    const ctx = this.context;
    const article = this._article;

    // Title
    if (article.title) {
      container.add(makeTextEl(ctx, 'h1', article.title, {
        style: {
          fontSize: '2.5rem',
          fontWeight: '700',
          lineHeight: '1.2',
          marginBottom: '16px',
          color: '#111'
        }
      }));
    }

    // Excerpt/Lead
    if (article.excerpt) {
      container.add(makeTextEl(ctx, 'p', article.excerpt, {
        style: {
          fontSize: '1.25rem',
          fontWeight: '400',
          color: '#555',
          marginBottom: '24px',
          lineHeight: '1.6',
          fontStyle: 'italic'
        }
      }));
    }
  }

  _renderMetadata(container) {
    const ctx = this.context;
    const article = this._article;

    const meta = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      style: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '32px',
        paddingBottom: '24px',
        borderBottom: '1px solid #e5e5e5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '14px',
        color: '#666'
      }
    }));

    // Author/Byline
    if (article.byline || article.authors) {
      const authorText = article.byline || this._formatAuthors(article.authors);
      const authorEl = meta.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: { display: 'flex', alignItems: 'center', gap: '6px' }
      }));
      addText(ctx, authorEl, `✍️ ${authorText}`);
    }

    // Date
    if (article.date) {
      const dateEl = meta.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: { display: 'flex', alignItems: 'center', gap: '6px' }
      }));
      addText(ctx, dateEl, `📅 ${this._formatDate(article.date)}`);
    }

    // Site name
    if (article.siteName) {
      const siteEl = meta.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: { display: 'flex', alignItems: 'center', gap: '6px' }
      }));
      addText(ctx, siteEl, `🌐 ${article.siteName}`);
    }

    // Word count
    if (article.wordCount) {
      const wordEl = meta.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: { display: 'flex', alignItems: 'center', gap: '6px' }
      }));
      const readTime = Math.ceil(article.wordCount / 200);
      addText(ctx, wordEl, `📖 ${article.wordCount.toLocaleString()} words (${readTime} min read)`);
    }

    // Classification
    if (article.classification) {
      const classEl = meta.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: {
          display: 'inline-flex',
          alignItems: 'center',
          gap: '4px',
          padding: '2px 8px',
          background: this._getClassificationColor(article.classification),
          borderRadius: '12px',
          fontSize: '12px',
          textTransform: 'uppercase',
          fontWeight: '600'
        }
      }));
      addText(ctx, classEl, article.classification);
    }
  }

  _renderContent(container) {
    const ctx = this.context;
    const article = this._article;

    const contentWrapper = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      attr: { class: 'article-content' },
      style: {
        fontSize: '1.125rem',
        color: '#333'
      }
    }));

    if (this._showHtml && article.content) {
      // Render sanitized HTML content
      // Note: In SSR, we add raw HTML as a StringControl
      const rawHtml = new jsgui.StringControl({
        context: ctx,
        text: article.content
      });
      contentWrapper.add(rawHtml);
    } else if (article.textContent) {
      // Render plain text as paragraphs
      const paragraphs = this._splitIntoParagraphs(article.textContent);
      for (const para of paragraphs) {
        if (para.trim()) {
          contentWrapper.add(makeTextEl(ctx, 'p', para, {
            style: { marginBottom: '1.5em' }
          }));
        }
      }
    } else {
      contentWrapper.add(makeTextEl(ctx, 'p', 'No article content available.', {
        style: { color: '#999', fontStyle: 'italic' }
      }));
    }
  }

  _renderFooter(container) {
    const ctx = this.context;
    const article = this._article;

    const footer = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'footer',
      style: {
        marginTop: '48px',
        paddingTop: '24px',
        borderTop: '1px solid #e5e5e5',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        fontSize: '13px',
        color: '#888'
      }
    }));

    // Source info
    if (article.url) {
      const sourceRow = footer.add(new jsgui.Control({
        context: ctx,
        tagName: 'div',
        style: { marginBottom: '8px' }
      }));
      addText(ctx, sourceRow, 'Source: ');
      sourceRow.add(makeLink(ctx, article.url, article.url, {
        color: '#0066cc',
        wordBreak: 'break-all'
      }));
    }

    // Analysis info
    if (article.analysisId) {
      footer.add(makeTextEl(ctx, 'div', `Analysis ID: ${article.analysisId}`, {
        style: { marginBottom: '4px' }
      }));
    }

    // Confidence score
    if (article.confidenceScore != null) {
      const confidencePercent = (article.confidenceScore * 100).toFixed(1);
      footer.add(makeTextEl(ctx, 'div', `Extraction Confidence: ${confidencePercent}%`, {
        style: { marginBottom: '4px' }
      }));
    }
  }

  // Helper methods

  _formatDate(dateStr) {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  _formatAuthors(authors) {
    if (!authors) return '';
    if (typeof authors === 'string') {
      try {
        const parsed = JSON.parse(authors);
        if (Array.isArray(parsed)) return parsed.join(', ');
        return authors;
      } catch {
        return authors;
      }
    }
    if (Array.isArray(authors)) return authors.join(', ');
    return String(authors);
  }

  _splitIntoParagraphs(text) {
    // Split text into paragraphs on double newlines or long runs of whitespace
    return text.split(/\n\s*\n|\r\n\s*\r\n/).filter(p => p.trim().length > 0);
  }

  _getClassificationColor(classification) {
    const colors = {
      'article': '#e6f3ff',
      'hub': '#fff3e6',
      'error': '#ffe6e6',
      'redirect': '#f0f0f0',
      'unknown': '#f5f5f5'
    };
    return colors[classification] || '#f5f5f5';
  }
}

module.exports = { ArticleViewerControl };
