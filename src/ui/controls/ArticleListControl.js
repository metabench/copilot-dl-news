'use strict';

/**
 * ArticleListControl
 * 
 * A jsgui3 control for displaying a paginated list of articles with content.
 * Shows title, host, date, word count, classification, and confidence score.
 * Each article links to the article viewer for full content display.
 * 
 * @example
 * const control = new ArticleListControl({
 *   context: ctx,
 *   articles: [...],
 *   pagination: { page: 1, limit: 50, total: 1000 },
 *   basePath: ''
 * });
 */

const jsgui = require('jsgui3-html');
const { addText, makeTextEl, makeLink, makeTd, makeTh } = require('../server/utils/jsgui3Helpers');

/**
 * Format a date for display in the list
 * @param {string|Date} date - Date to format
 * @returns {string} Formatted date string
 */
function formatDate(date) {
  if (!date) return '—';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    });
  } catch {
    return '—';
  }
}

/**
 * Format word count
 * @param {number} count - Word count
 * @returns {string} Formatted word count
 */
function formatWordCount(count) {
  if (count == null) return '—';
  if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
  return String(count);
}

/**
 * Format confidence as percentage
 * @param {number} score - Confidence score (0-1)
 * @returns {string} Formatted percentage
 */
function formatConfidence(score) {
  if (score == null) return '—';
  return `${Math.round(score * 100)}%`;
}

/**
 * Truncate title to a reasonable length
 * @param {string} title - Article title
 * @param {number} maxLen - Maximum length
 * @returns {string} Truncated title
 */
function truncateTitle(title, maxLen = 80) {
  if (!title) return 'Untitled';
  if (title.length <= maxLen) return title;
  return title.slice(0, maxLen - 3) + '...';
}

class ArticleListControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._articles = spec.articles || [];
    this._pagination = spec.pagination || { page: 1, limit: 50, total: 0 };
    this._basePath = spec.basePath || '';
    this._filters = spec.filters || {};
    this._sortBy = spec.sortBy || 'fetched_at';
    this._sortDir = spec.sortDir || 'DESC';
    
    // SSR: call compose immediately
    this.compose();
  }

  compose() {
    const container = this.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { padding: '16px' }
    }));

    // Header with title and stats
    this._renderHeader(container);

    // Filter/sort controls
    this._renderFilters(container);

    // Articles table
    this._renderTable(container);

    // Pagination
    this._renderPagination(container);
  }

  _renderHeader(container) {
    const header = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '16px'
      }
    }));

    header.add(makeTextEl(this.context, 'h2', '📰 Articles with Content', {
      style: { margin: 0 }
    }));

    // Stats
    const stats = header.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: { color: '#6b7280', fontSize: '14px' }
    }));
    const { page, limit, total } = this._pagination;
    const start = (page - 1) * limit + 1;
    const end = Math.min(page * limit, total);
    addText(this.context, stats, `Showing ${start}–${end} of ${total.toLocaleString()} articles`);
  }

  _renderFilters(container) {
    const filters = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        padding: '12px',
        backgroundColor: '#f9fafb',
        borderRadius: '8px',
        fontSize: '14px'
      }
    }));

    // Search form (non-interactive, for SSR display)
    filters.add(makeTextEl(this.context, 'span', 'Sort by: ', {
      style: { color: '#6b7280' }
    }));

    const sortOptions = [
      { value: 'fetched_at', label: 'Crawl Date' },
      { value: 'title', label: 'Title' },
      { value: 'word_count', label: 'Word Count' },
      { value: 'confidence_score', label: 'Confidence' },
      { value: 'host', label: 'Domain' }
    ];

    for (const opt of sortOptions) {
      const isCurrent = this._sortBy === opt.value;
      const newDir = isCurrent && this._sortDir === 'DESC' ? 'ASC' : 'DESC';
      const href = `${this._basePath}/articles?sortBy=${opt.value}&sortDir=${newDir}`;
      
      const link = filters.add(makeLink(this.context, opt.label, href, {
        color: isCurrent ? '#2563eb' : '#6b7280',
        textDecoration: isCurrent ? 'underline' : 'none',
        fontWeight: isCurrent ? '600' : '400'
      }));

      if (isCurrent) {
        const arrow = this._sortDir === 'DESC' ? ' ↓' : ' ↑';
        addText(this.context, link, arrow);
      }
    }
  }

  _renderTable(container) {
    if (this._articles.length === 0) {
      container.add(makeTextEl(this.context, 'p', 'No articles found.', {
        style: { color: '#9ca3af', fontStyle: 'italic', padding: '24px', textAlign: 'center' }
      }));
      return;
    }

    const table = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'table',
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px'
      }
    }));

    // Header row
    const thead = table.add(new jsgui.Control({ context: this.context, tagName: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: this.context, tagName: 'tr' }));

    const headers = [
      { label: '#', style: { width: '40px', textAlign: 'right' } },
      { label: 'Title', style: { textAlign: 'left' } },
      { label: 'Domain', style: { width: '150px' } },
      { label: 'Published', style: { width: '100px' } },
      { label: 'Words', style: { width: '70px', textAlign: 'right' } },
      { label: 'Classification', style: { width: '120px' } },
      { label: 'Confidence', style: { width: '80px', textAlign: 'right' } },
      { label: 'View', style: { width: '60px', textAlign: 'center' } }
    ];

    for (const h of headers) {
      headerRow.add(makeTh(this.context, h.label, {
        style: {
          padding: '10px 8px',
          borderBottom: '2px solid #e5e7eb',
          backgroundColor: '#f9fafb',
          fontWeight: '600',
          ...h.style
        }
      }));
    }

    // Body rows
    const tbody = table.add(new jsgui.Control({ context: this.context, tagName: 'tbody' }));
    const { page, limit } = this._pagination;
    const startIndex = (page - 1) * limit;

    for (let i = 0; i < this._articles.length; i++) {
      const article = this._articles[i];
      const row = tbody.add(new jsgui.Control({
        context: this.context,
        tagName: 'tr',
        style: {
          backgroundColor: i % 2 === 0 ? '#ffffff' : '#f9fafb'
        }
      }));

      const cellStyle = { padding: '10px 8px', borderBottom: '1px solid #e5e7eb' };

      // Index
      row.add(makeTd(this.context, String(startIndex + i + 1), {
        style: { ...cellStyle, textAlign: 'right', color: '#9ca3af' }
      }));

      // Title (linked to article viewer)
      const titleCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: cellStyle
      }));
      const titleLink = titleCell.add(makeLink(
        this.context,
        truncateTitle(article.title),
        `/articles/${article.fetch_id}`,
        { color: '#2563eb', textDecoration: 'none', fontWeight: '500' }
      ));

      // Domain
      const domainCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { ...cellStyle, fontSize: '13px' }
      }));
      domainCell.add(makeLink(
        this.context,
        article.host,
        `/domains/${article.host}`,
        { color: '#6b7280', textDecoration: 'none' }
      ));

      // Published date
      row.add(makeTd(this.context, formatDate(article.published_date || article.fetched_at), {
        style: { ...cellStyle, fontSize: '13px', color: '#6b7280' }
      }));

      // Word count
      row.add(makeTd(this.context, formatWordCount(article.word_count), {
        style: { ...cellStyle, textAlign: 'right' }
      }));

      // Classification
      row.add(makeTd(this.context, article.classification || '—', {
        style: { ...cellStyle, fontSize: '12px', color: '#4b5563' }
      }));

      // Confidence
      const confText = formatConfidence(article.confidence_score);
      const confColor = article.confidence_score >= 0.8 ? '#22c55e' :
                        article.confidence_score >= 0.6 ? '#84cc16' :
                        article.confidence_score >= 0.4 ? '#eab308' : '#9ca3af';
      row.add(makeTd(this.context, confText, {
        style: { ...cellStyle, textAlign: 'right', color: confColor, fontWeight: '500' }
      }));

      // View link
      const viewCell = row.add(new jsgui.Control({
        context: this.context,
        tagName: 'td',
        style: { ...cellStyle, textAlign: 'center' }
      }));
      viewCell.add(makeLink(
        this.context,
        '📖',
        `/articles/${article.fetch_id}`,
        { textDecoration: 'none', fontSize: '18px' }
      ));
    }
  }

  _renderPagination(container) {
    const { page, limit, total } = this._pagination;
    const totalPages = Math.ceil(total / limit);
    if (totalPages <= 1) return;

    const nav = container.add(new jsgui.Control({
      context: this.context,
      tagName: 'div',
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '24px',
        fontSize: '14px'
      }
    }));

    // Helper to build page link
    const makePageLink = (pageNum, label, enabled = true) => {
      const href = `${this._basePath}/articles?page=${pageNum}&limit=${limit}&sortBy=${this._sortBy}&sortDir=${this._sortDir}`;
      if (!enabled) {
        return nav.add(makeTextEl(this.context, 'span', label, {
          style: { padding: '6px 12px', color: '#9ca3af' }
        }));
      }
      return nav.add(makeLink(this.context, label, href, {
        padding: '6px 12px',
        color: '#2563eb',
        textDecoration: 'none',
        borderRadius: '4px',
        backgroundColor: pageNum === page ? '#e0e7ff' : 'transparent'
      }));
    };

    // First / Previous
    makePageLink(1, '« First', page > 1);
    makePageLink(page - 1, '‹ Prev', page > 1);

    // Page numbers (show 5 around current)
    const startPage = Math.max(1, page - 2);
    const endPage = Math.min(totalPages, page + 2);
    
    if (startPage > 1) {
      nav.add(makeTextEl(this.context, 'span', '...', { style: { padding: '6px' } }));
    }

    for (let p = startPage; p <= endPage; p++) {
      const link = makePageLink(p, String(p), p !== page);
      if (p === page) {
        link.dom.attributes.style += '; font-weight: 600; color: #1e40af;';
      }
    }

    if (endPage < totalPages) {
      nav.add(makeTextEl(this.context, 'span', '...', { style: { padding: '6px' } }));
    }

    // Next / Last
    makePageLink(page + 1, 'Next ›', page < totalPages);
    makePageLink(totalPages, 'Last »', page < totalPages);
  }
}

module.exports = { ArticleListControl };
