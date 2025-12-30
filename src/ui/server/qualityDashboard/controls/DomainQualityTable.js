'use strict';

/**
 * DomainQualityTable - Sortable table of domain quality scores
 * 
 * Displays per-domain extraction quality metrics with color-coded
 * confidence scores and sort controls.
 */

const jsgui = require('jsgui3-html');

const StringControl = jsgui.String_Control;

/**
 * Get confidence level class for styling
 * @param {number} confidence - Confidence score 0-1
 * @returns {string} CSS class suffix
 */
function getConfidenceLevel(confidence) {
  if (confidence >= 0.8) return 'high';
  if (confidence >= 0.5) return 'medium';
  return 'low';
}

/**
 * Format confidence as percentage
 * @param {number} confidence - Confidence score 0-1
 * @returns {string} Formatted percentage
 */
function formatConfidence(confidence) {
  if (confidence == null) return '-';
  return `${(confidence * 100).toFixed(1)}%`;
}

class DomainQualityTable extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.domains - Array of domain quality objects
   * @param {string} [spec.sortBy='confidence'] - Current sort field
   * @param {string} [spec.sortOrder='asc'] - Sort order
   * @param {string} [spec.baseUrl='/domains'] - Base URL for sort links
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.domains = spec.domains || [];
    this.sortBy = spec.sortBy || 'confidence';
    this.sortOrder = spec.sortOrder || 'asc';
    this.baseUrl = spec.baseUrl || '/domains';
    
    this.add_class('quality-dashboard__domain-table');
    this._compose();
  }

  _compose() {
    if (this.domains.length === 0) {
      this._composeEmpty();
      return;
    }

    const table = new jsgui.Control({ context: this.context, tagName: 'table' });
    table.add_class('quality-table');
    
    this._composeHeader(table);
    this._composeBody(table);
    
    this.add(table);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('quality-table__empty');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add(new StringControl({ context: this.context, text: '📊' }));
    empty.add(icon);
    
    const text = new jsgui.Control({ context: this.context, tagName: 'p' });
    text.add(new StringControl({ 
      context: this.context, 
      text: 'No domain quality data available. Run analysis to populate.' 
    }));
    empty.add(text);
    
    this.add(empty);
  }

  _composeHeader(table) {
    const thead = new jsgui.Control({ context: this.context, tagName: 'thead' });
    const headerRow = new jsgui.Control({ context: this.context, tagName: 'tr' });

    const columns = [
      { key: 'host', label: 'Domain', sortable: true },
      { key: 'articleCount', label: 'Articles', sortable: true },
      { key: 'avgConfidence', label: 'Avg Confidence', sortable: true },
      { key: 'minConfidence', label: 'Min', sortable: false },
      { key: 'maxConfidence', label: 'Max', sortable: false },
      { key: 'qualityRate', label: 'Quality Rate', sortable: false },
      { key: 'lastAnalyzedAt', label: 'Last Analyzed', sortable: false }
    ];

    for (const col of columns) {
      const th = new jsgui.Control({ context: this.context, tagName: 'th' });
      th.add_class('quality-table__header');
      
      if (col.sortable) {
        const isCurrent = this._normalizeSortKey(col.key) === this._normalizeSortKey(this.sortBy);
        const nextOrder = isCurrent && this.sortOrder === 'asc' ? 'desc' : 'asc';
        const href = `${this.baseUrl}?sort=${col.key}&order=${nextOrder}`;
        
        const link = new jsgui.Control({ context: this.context, tagName: 'a' });
        link.dom.attributes.href = href;
        link.add_class('quality-table__sort-link');
        
        let labelText = col.label;
        if (isCurrent) {
          labelText += this.sortOrder === 'asc' ? ' ↑' : ' ↓';
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

  _normalizeSortKey(key) {
    const keyMap = {
      'confidence': 'avgConfidence',
      'count': 'articleCount',
      'articles': 'articleCount'
    };
    return keyMap[key] || key;
  }

  _composeBody(table) {
    const tbody = new jsgui.Control({ context: this.context, tagName: 'tbody' });

    for (const domain of this.domains) {
      const row = new jsgui.Control({ context: this.context, tagName: 'tr' });
      const level = getConfidenceLevel(domain.avgConfidence);
      row.add_class(`quality-table__row--${level}`);

      // Domain name
      const hostCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      hostCell.add_class('quality-table__cell--host');
      const hostLink = new jsgui.Control({ context: this.context, tagName: 'a' });
      hostLink.dom.attributes.href = `/domain/${encodeURIComponent(domain.host)}`;
      hostLink.add(new StringControl({ context: this.context, text: domain.host }));
      hostCell.add(hostLink);
      row.add(hostCell);

      // Article count
      const countCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      countCell.add_class('quality-table__cell--count');
      countCell.add(new StringControl({ 
        context: this.context, 
        text: domain.articleCount?.toLocaleString() || '0' 
      }));
      row.add(countCell);

      // Average confidence
      const avgCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      avgCell.add_class('quality-table__cell--confidence');
      avgCell.add_class(`quality-table__cell--${level}`);
      
      const badge = new jsgui.Control({ context: this.context, tagName: 'span' });
      badge.add_class('quality-badge');
      badge.add_class(`quality-badge--${level}`);
      badge.add(new StringControl({ 
        context: this.context, 
        text: formatConfidence(domain.avgConfidence) 
      }));
      avgCell.add(badge);
      row.add(avgCell);

      // Min confidence
      const minCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      minCell.add_class('quality-table__cell--min');
      minCell.add(new StringControl({ 
        context: this.context, 
        text: formatConfidence(domain.minConfidence) 
      }));
      row.add(minCell);

      // Max confidence
      const maxCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      maxCell.add_class('quality-table__cell--max');
      maxCell.add(new StringControl({ 
        context: this.context, 
        text: formatConfidence(domain.maxConfidence) 
      }));
      row.add(maxCell);

      // Quality rate
      const rateCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      rateCell.add_class('quality-table__cell--rate');
      rateCell.add(new StringControl({ 
        context: this.context, 
        text: `${domain.qualityRate || 0}%` 
      }));
      row.add(rateCell);

      // Last analyzed
      const dateCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      dateCell.add_class('quality-table__cell--date');
      const dateText = domain.lastAnalyzedAt 
        ? new Date(domain.lastAnalyzedAt).toLocaleDateString()
        : '-';
      dateCell.add(new StringControl({ context: this.context, text: dateText }));
      row.add(dateCell);

      tbody.add(row);
    }

    table.add(tbody);
  }
}

module.exports = { DomainQualityTable, getConfidenceLevel, formatConfidence };
