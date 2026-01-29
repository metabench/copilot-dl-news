'use strict';

const jsgui = require('jsgui3-html');
const { addText, makeTextEl, makeLink, makeTd, makeTh } = require('../../shared/utils/jsgui3Helpers');

/**
 * ArticleListControl - Displays a searchable, sortable list of extracted articles
 * 
 * This control provides a table view of articles with titles, dates, sources,
 * and word counts. Each row links to the full article viewer.
 */
class ArticleListControl extends jsgui.Control {
  constructor(spec) {
    super(spec);
    this._articles = spec.articles || [];
    this._totalCount = spec.totalCount || this._articles.length;
    this._page = spec.page || 1;
    this._pageSize = spec.pageSize || 50;
    this._sortBy = spec.sortBy || 'date';
    this._sortDir = spec.sortDir || 'desc';
    this._filter = spec.filter || {};
    this._basePath = spec.basePath || '';
  }

  compose() {
    const ctx = this.context;

    const container = this.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      style: {
        padding: '24px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
      }
    }));

    // Header
    this._renderHeader(container);

    // Search/filter bar
    this._renderFilterBar(container);

    // Stats summary
    this._renderStats(container);

    // Articles table
    this._renderTable(container);

    // Pagination
    this._renderPagination(container);
  }

  _renderHeader(container) {
    const ctx = this.context;

    const header = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      style: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '24px'
      }
    }));

    header.add(makeTextEl(ctx, 'h1', '📰 Article Library', {
      style: {
        fontSize: '1.75rem',
        fontWeight: '600',
        margin: '0'
      }
    }));

    header.add(makeTextEl(ctx, 'span', `${this._totalCount.toLocaleString()} articles`, {
      style: {
        fontSize: '1rem',
        color: '#666'
      }
    }));
  }

  _renderFilterBar(container) {
    const ctx = this.context;

    const bar = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      style: {
        display: 'flex',
        gap: '16px',
        marginBottom: '16px',
        padding: '16px',
        background: '#f8f9fa',
        borderRadius: '8px',
        flexWrap: 'wrap'
      }
    }));

    // Search form (works without JS via form submission)
    const form = bar.add(new jsgui.Control({
      context: ctx,
      tagName: 'form',
      attr: {
        method: 'GET',
        action: this._basePath || '/'
      },
      style: {
        display: 'flex',
        gap: '8px',
        flex: '1',
        minWidth: '200px'
      }
    }));

    const searchInput = form.add(new jsgui.Control({
      context: ctx,
      tagName: 'input',
      attr: {
        type: 'text',
        name: 'q',
        placeholder: 'Search articles...',
        value: this._filter.q || ''
      },
      style: {
        flex: '1',
        padding: '8px 12px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '14px'
      }
    }));

    const searchBtn = form.add(new jsgui.Control({
      context: ctx,
      tagName: 'button',
      attr: { type: 'submit' },
      style: {
        padding: '8px 16px',
        background: '#0066cc',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px'
      }
    }));
    addText(ctx, searchBtn, '🔍 Search');

    // Classification filter links
    const filters = bar.add(new jsgui.Control({
      context: ctx,
      tagName: 'div',
      style: {
        display: 'flex',
        gap: '8px',
        alignItems: 'center'
      }
    }));

    addText(ctx, filters, 'Show: ');

    const classifications = ['all', 'article', 'hub', 'other'];
    for (const cls of classifications) {
      const isActive = (this._filter.classification || 'all') === cls;
      const href = this._buildUrl({ classification: cls === 'all' ? null : cls, page: 1 });
      
      filters.add(makeLink(ctx, cls, href, {
        padding: '4px 10px',
        background: isActive ? '#0066cc' : '#e9ecef',
        color: isActive ? 'white' : '#495057',
        borderRadius: '12px',
        textDecoration: 'none',
        fontSize: '13px',
        textTransform: 'capitalize'
      }));
    }
  }

  _renderStats(container) {
    const ctx = this.context;

    if (this._articles.length === 0) {
      container.add(makeTextEl(ctx, 'p', 'No articles found matching your criteria.', {
        style: {
          padding: '40px',
          textAlign: 'center',
          color: '#666',
          fontSize: '1.1rem'
        }
      }));
      return;
    }

    const start = (this._page - 1) * this._pageSize + 1;
    const end = Math.min(this._page * this._pageSize, this._totalCount);

    container.add(makeTextEl(ctx, 'p', `Showing ${start.toLocaleString()} - ${end.toLocaleString()} of ${this._totalCount.toLocaleString()} articles`, {
      style: {
        color: '#666',
        fontSize: '13px',
        marginBottom: '12px'
      }
    }));
  }

  _renderTable(container) {
    const ctx = this.context;

    if (this._articles.length === 0) return;

    const table = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'table',
      style: {
        width: '100%',
        borderCollapse: 'collapse',
        fontSize: '14px',
        background: 'white'
      }
    }));

    // Header
    const thead = table.add(new jsgui.Control({ context: ctx, tagName: 'thead' }));
    const headerRow = thead.add(new jsgui.Control({ context: ctx, tagName: 'tr' }));

    const columns = [
      { key: 'title', label: 'Title', sortable: true, width: '45%' },
      { key: 'host', label: 'Source', sortable: true, width: '15%' },
      { key: 'date', label: 'Date', sortable: true, width: '15%' },
      { key: 'word_count', label: 'Words', sortable: true, width: '10%' },
      { key: 'classification', label: 'Type', sortable: true, width: '10%' }
    ];

    for (const col of columns) {
      const th = headerRow.add(new jsgui.Control({
        context: ctx,
        tagName: 'th',
        style: {
          textAlign: 'left',
          padding: '12px 8px',
          borderBottom: '2px solid #dee2e6',
          background: '#f8f9fa',
          fontWeight: '600',
          width: col.width
        }
      }));

      if (col.sortable) {
        const sortDir = this._sortBy === col.key
          ? (this._sortDir === 'asc' ? 'desc' : 'asc')
          : 'desc';
        const href = this._buildUrl({ sortBy: col.key, sortDir, page: 1 });
        const arrow = this._sortBy === col.key
          ? (this._sortDir === 'asc' ? ' ↑' : ' ↓')
          : '';
        
        th.add(makeLink(ctx, col.label + arrow, href, {
          color: '#495057',
          textDecoration: 'none'
        }));
      } else {
        addText(ctx, th, col.label);
      }
    }

    // Body
    const tbody = table.add(new jsgui.Control({ context: ctx, tagName: 'tbody' }));

    for (const article of this._articles) {
      const row = tbody.add(new jsgui.Control({
        context: ctx,
        tagName: 'tr',
        style: { borderBottom: '1px solid #e9ecef' }
      }));

      // Title (linked to viewer)
      const titleCell = row.add(makeTd(ctx, '', { padding: '12px 8px' }));
      const titleLink = titleCell.add(makeLink(
        ctx,
        article.title || '(Untitled)',
        `${this._basePath}/article/${article.id}`,
        {
          color: '#0066cc',
          textDecoration: 'none',
          fontWeight: '500'
        }
      ));

      // Host
      row.add(makeTd(ctx, this._extractDomain(article.url) || '-', {
        padding: '12px 8px',
        color: '#666',
        fontSize: '13px'
      }));

      // Date
      row.add(makeTd(ctx, this._formatShortDate(article.date), {
        padding: '12px 8px',
        color: '#666',
        fontSize: '13px'
      }));

      // Word count
      row.add(makeTd(ctx, article.word_count ? article.word_count.toLocaleString() : '-', {
        padding: '12px 8px',
        textAlign: 'right',
        color: '#666',
        fontSize: '13px'
      }));

      // Classification
      const classCell = row.add(new jsgui.Control({
        context: ctx,
        tagName: 'td',
        style: { padding: '12px 8px' }
      }));
      const badge = classCell.add(new jsgui.Control({
        context: ctx,
        tagName: 'span',
        style: {
          display: 'inline-block',
          padding: '2px 8px',
          background: this._getClassificationColor(article.classification),
          borderRadius: '10px',
          fontSize: '11px',
          textTransform: 'uppercase'
        }
      }));
      addText(ctx, badge, article.classification || 'unknown');
    }
  }

  _renderPagination(container) {
    const ctx = this.context;

    const totalPages = Math.ceil(this._totalCount / this._pageSize);
    if (totalPages <= 1) return;

    const nav = container.add(new jsgui.Control({
      context: ctx,
      tagName: 'nav',
      style: {
        display: 'flex',
        justifyContent: 'center',
        gap: '8px',
        marginTop: '24px'
      }
    }));

    // Previous
    if (this._page > 1) {
      nav.add(makeLink(ctx, '← Prev', this._buildUrl({ page: this._page - 1 }), {
        padding: '8px 12px',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        textDecoration: 'none',
        color: '#0066cc'
      }));
    }

    // Page numbers
    const startPage = Math.max(1, this._page - 2);
    const endPage = Math.min(totalPages, this._page + 2);

    if (startPage > 1) {
      nav.add(makeLink(ctx, '1', this._buildUrl({ page: 1 }), {
        padding: '8px 12px',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        textDecoration: 'none',
        color: '#0066cc'
      }));
      if (startPage > 2) {
        nav.add(makeTextEl(ctx, 'span', '...', { style: { padding: '8px' } }));
      }
    }

    for (let p = startPage; p <= endPage; p++) {
      const isCurrent = p === this._page;
      nav.add(makeLink(ctx, String(p), this._buildUrl({ page: p }), {
        padding: '8px 12px',
        border: '1px solid ' + (isCurrent ? '#0066cc' : '#dee2e6'),
        background: isCurrent ? '#0066cc' : 'white',
        color: isCurrent ? 'white' : '#0066cc',
        borderRadius: '4px',
        textDecoration: 'none'
      }));
    }

    if (endPage < totalPages) {
      if (endPage < totalPages - 1) {
        nav.add(makeTextEl(ctx, 'span', '...', { style: { padding: '8px' } }));
      }
      nav.add(makeLink(ctx, String(totalPages), this._buildUrl({ page: totalPages }), {
        padding: '8px 12px',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        textDecoration: 'none',
        color: '#0066cc'
      }));
    }

    // Next
    if (this._page < totalPages) {
      nav.add(makeLink(ctx, 'Next →', this._buildUrl({ page: this._page + 1 }), {
        padding: '8px 12px',
        border: '1px solid #dee2e6',
        borderRadius: '4px',
        textDecoration: 'none',
        color: '#0066cc'
      }));
    }
  }

  // Helper methods

  _buildUrl(overrides) {
    const params = new URLSearchParams();
    
    const q = overrides.q !== undefined ? overrides.q : this._filter.q;
    const classification = overrides.classification !== undefined ? overrides.classification : this._filter.classification;
    const sortBy = overrides.sortBy !== undefined ? overrides.sortBy : this._sortBy;
    const sortDir = overrides.sortDir !== undefined ? overrides.sortDir : this._sortDir;
    const page = overrides.page !== undefined ? overrides.page : this._page;

    if (q) params.set('q', q);
    if (classification) params.set('classification', classification);
    if (sortBy !== 'date') params.set('sortBy', sortBy);
    if (sortDir !== 'desc') params.set('sortDir', sortDir);
    if (page > 1) params.set('page', String(page));

    const queryStr = params.toString();
    return this._basePath + (queryStr ? '?' + queryStr : '');
  }

  _formatShortDate(dateStr) {
    if (!dateStr) return '-';
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric'
      });
    } catch {
      return dateStr;
    }
  }

  _extractDomain(url) {
    if (!url) return null;
    try {
      return new URL(url).hostname.replace(/^www\./, '');
    } catch {
      return null;
    }
  }

  _getClassificationColor(classification) {
    const colors = {
      'article': '#d4edda',
      'hub': '#fff3cd',
      'error': '#f8d7da',
      'redirect': '#e2e3e5',
      'unknown': '#e9ecef'
    };
    return colors[classification] || '#e9ecef';
  }
}

module.exports = { ArticleListControl };
