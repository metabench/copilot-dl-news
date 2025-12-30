'use strict';

/**
 * DomainLeaderboard - Sortable table of top domains
 * 
 * Displays the top domains by article count with
 * sortable columns and drill-down links.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

/**
 * Format date for relative display
 * @param {string} dateStr - ISO date string
 * @returns {string}
 */
function formatRelativeDate(dateStr) {
  if (!dateStr) return '-';
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  return date.toLocaleDateString();
}

class DomainLeaderboard extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.domains - Array of domain leader objects
   * @param {string} [spec.sortBy='count'] - Current sort field
   * @param {string} [spec.sortOrder='desc'] - Sort order
   * @param {string} [spec.baseUrl='/'] - Base URL for sort links
   * @param {string} [spec.period='30d'] - Current period
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.domains = spec.domains || [];
    this.sortBy = spec.sortBy || 'count';
    this.sortOrder = spec.sortOrder || 'desc';
    this.baseUrl = spec.baseUrl || '/';
    this.period = spec.period || '30d';
    
    this.add_class('domain-leaderboard');
    this._compose();
  }

  _compose() {
    // Title
    const title = new jsgui.Control({ context: this.context, tagName: 'h3' });
    title.add_class('domain-leaderboard__title');
    title.add(new StringControl({ context: this.context, text: '🏆 Domain Leaderboard' }));
    this.add(title);

    if (this.domains.length === 0) {
      this._composeEmpty();
      return;
    }

    const table = new jsgui.Control({ context: this.context, tagName: 'table' });
    table.add_class('analytics-table');
    
    this._composeHeader(table);
    this._composeBody(table);
    
    this.add(table);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('domain-leaderboard__empty');
    empty.add(new StringControl({ 
      context: this.context, 
      text: 'No domain data available for this period' 
    }));
    this.add(empty);
  }

  _composeHeader(table) {
    const thead = new jsgui.Control({ context: this.context, tagName: 'thead' });
    const headerRow = new jsgui.Control({ context: this.context, tagName: 'tr' });

    const columns = [
      { key: 'rank', label: '#', sortable: false },
      { key: 'host', label: 'Domain', sortable: true },
      { key: 'articleCount', label: 'Articles', sortable: true },
      { key: 'avgPerDay', label: 'Avg/Day', sortable: true },
      { key: 'lastCrawled', label: 'Last Crawled', sortable: true }
    ];

    for (const col of columns) {
      const th = new jsgui.Control({ context: this.context, tagName: 'th' });
      th.add_class('analytics-table__header');
      
      if (col.sortable) {
        const isCurrent = col.key === this.sortBy || 
          (col.key === 'articleCount' && this.sortBy === 'count');
        const nextOrder = isCurrent && this.sortOrder === 'desc' ? 'asc' : 'desc';
        const href = `${this.baseUrl}?sort=${col.key}&order=${nextOrder}&period=${this.period}`;
        
        const link = new jsgui.Control({ context: this.context, tagName: 'a' });
        link.dom.attributes.href = href;
        link.add_class('analytics-table__sort-link');
        
        let labelText = col.label;
        if (isCurrent) {
          labelText += this.sortOrder === 'desc' ? ' ↓' : ' ↑';
        }
        
        link.add(new StringControl({ context: this.context, text: labelText }));
        th.add(link);
      } else {
        th.add(new StringControl({ context: this.context, text: col.label }));
      }
      
      headerRow.add(th);
    }

    thead.add(headerRow);
    table.add(thead);
  }

  _composeBody(table) {
    const tbody = new jsgui.Control({ context: this.context, tagName: 'tbody' });

    for (const domain of this.domains) {
      const row = new jsgui.Control({ context: this.context, tagName: 'tr' });
      
      // Highlight top 3
      if (domain.rank <= 3) {
        row.add_class('analytics-table__row--top');
      }

      // Rank
      const rankCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      rankCell.add_class('analytics-table__cell--rank');
      const rankEmoji = domain.rank === 1 ? '🥇' : domain.rank === 2 ? '🥈' : domain.rank === 3 ? '🥉' : '';
      rankCell.add(new StringControl({ 
        context: this.context, 
        text: rankEmoji ? `${rankEmoji}` : String(domain.rank)
      }));
      row.add(rankCell);

      // Domain name
      const hostCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      hostCell.add_class('analytics-table__cell--host');
      hostCell.add(new StringControl({ context: this.context, text: domain.host }));
      row.add(hostCell);

      // Article count
      const countCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      countCell.add_class('analytics-table__cell--count');
      countCell.add(new StringControl({ 
        context: this.context, 
        text: domain.articleCount?.toLocaleString() || '0' 
      }));
      row.add(countCell);

      // Avg per day
      const avgCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      avgCell.add_class('analytics-table__cell--avg');
      avgCell.add(new StringControl({ 
        context: this.context, 
        text: domain.avgPerDay?.toFixed(1) || '0' 
      }));
      row.add(avgCell);

      // Last crawled
      const dateCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      dateCell.add_class('analytics-table__cell--date');
      dateCell.add(new StringControl({ 
        context: this.context, 
        text: formatRelativeDate(domain.lastCrawled)
      }));
      row.add(dateCell);

      tbody.add(row);
    }

    table.add(tbody);
  }
}

module.exports = { DomainLeaderboard, formatRelativeDate };
