'use strict';

/**
 * CrawlManagementPanel - Active crawls display with start/stop controls
 * 
 * Shows scheduled and active crawls with management actions.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

/**
 * Get status badge class
 * @param {string} status - Crawl status
 * @returns {string} CSS class suffix
 */
function getStatusClass(status) {
  if (status === 'running') return 'primary';
  if (status === 'completed') return 'success';
  if (status === 'failed') return 'danger';
  if (status === 'pending') return 'warning';
  if (status === 'cancelled') return 'secondary';
  return 'default';
}

/**
 * Get status icon
 * @param {string} status - Crawl status
 * @returns {string} Emoji icon
 */
function getStatusIcon(status) {
  if (status === 'running') return '🔄';
  if (status === 'completed') return '✅';
  if (status === 'failed') return '❌';
  if (status === 'pending') return '⏳';
  if (status === 'cancelled') return '🛑';
  return '📝';
}

/**
 * Format duration
 * @param {string} startedAt - Start timestamp
 * @param {string} [completedAt] - End timestamp
 * @returns {string} Duration string
 */
function formatDuration(startedAt, completedAt) {
  if (!startedAt) return '-';
  
  const start = new Date(startedAt);
  const end = completedAt ? new Date(completedAt) : new Date();
  const diffMs = end - start;
  
  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

class CrawlManagementPanel extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.crawls - Array of crawl job objects
   * @param {Object} [spec.stats] - Crawl statistics
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.crawls = spec.crawls || [];
    this.stats = spec.stats || {};
    
    this.add_class('admin-panel');
    this.add_class('crawl-management-panel');
    this._compose();
  }

  _compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: 'div' });
    header.add_class('admin-panel__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h2' });
    title.add_class('admin-panel__title');
    title.add(new StringControl({ context: this.context, text: '🕷️ Crawl Management' }));
    header.add(title);
    
    const actions = new jsgui.Control({ context: this.context, tagName: 'div' });
    actions.add_class('admin-panel__actions');
    
    const startBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
    startBtn.add_class('btn');
    startBtn.add_class('btn--primary');
    startBtn.dom.attributes.type = 'button';
    startBtn.dom.attributes['data-action'] = 'start-crawl';
    startBtn.add(new StringControl({ context: this.context, text: '➕ Start Crawl' }));
    actions.add(startBtn);
    
    header.add(actions);
    this.add(header);
    
    // Stats cards
    this._composeStats();
    
    // Crawls table
    this._composeCrawlsTable();
  }

  _composeStats() {
    const statsGrid = new jsgui.Control({ context: this.context, tagName: 'div' });
    statsGrid.add_class('crawl-stats-grid');
    
    const stats = [
      { icon: '⏳', label: 'Pending', value: this.stats.pending || 0 },
      { icon: '🔄', label: 'Running', value: this.stats.running || 0 },
      { icon: '✅', label: 'Today', value: this.stats.today || 0 }
    ];
    
    for (const stat of stats) {
      const card = new jsgui.Control({ context: this.context, tagName: 'div' });
      card.add_class('crawl-stat-card');
      
      const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
      icon.add_class('crawl-stat-card__icon');
      icon.add(new StringControl({ context: this.context, text: stat.icon }));
      card.add(icon);
      
      const content = new jsgui.Control({ context: this.context, tagName: 'div' });
      content.add_class('crawl-stat-card__content');
      
      const value = new jsgui.Control({ context: this.context, tagName: 'div' });
      value.add_class('crawl-stat-card__value');
      value.add(new StringControl({ context: this.context, text: String(stat.value) }));
      content.add(value);
      
      const label = new jsgui.Control({ context: this.context, tagName: 'div' });
      label.add_class('crawl-stat-card__label');
      label.add(new StringControl({ context: this.context, text: stat.label }));
      content.add(label);
      
      card.add(content);
      statsGrid.add(card);
    }
    
    this.add(statsGrid);
  }

  _composeCrawlsTable() {
    if (this.crawls.length === 0) {
      this._composeEmpty();
      return;
    }
    
    const table = new jsgui.Control({ context: this.context, tagName: 'table' });
    table.add_class('admin-table');
    
    // Header
    const thead = new jsgui.Control({ context: this.context, tagName: 'thead' });
    const headerRow = new jsgui.Control({ context: this.context, tagName: 'tr' });
    
    const headers = ['ID', 'Status', 'URLs Found', 'Processed', 'Duration', 'Started', 'Actions'];
    for (const label of headers) {
      const th = new jsgui.Control({ context: this.context, tagName: 'th' });
      th.add_class('admin-table__header');
      th.add(new StringControl({ context: this.context, text: label }));
      headerRow.add(th);
    }
    
    thead.add(headerRow);
    table.add(thead);
    
    // Body
    const tbody = new jsgui.Control({ context: this.context, tagName: 'tbody' });
    
    for (const crawl of this.crawls) {
      const row = new jsgui.Control({ context: this.context, tagName: 'tr' });
      row.add_class('admin-table__row');
      
      // ID
      const idCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      idCell.add_class('admin-table__cell');
      idCell.add(new StringControl({ context: this.context, text: `#${crawl.id}` }));
      row.add(idCell);
      
      // Status
      const statusCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      statusCell.add_class('admin-table__cell');
      
      const statusBadge = new jsgui.Control({ context: this.context, tagName: 'span' });
      statusBadge.add_class('badge');
      statusBadge.add_class(`badge--${getStatusClass(crawl.status)}`);
      statusBadge.add(new StringControl({ 
        context: this.context, 
        text: `${getStatusIcon(crawl.status)} ${crawl.status}` 
      }));
      statusCell.add(statusBadge);
      row.add(statusCell);
      
      // URLs Found
      const foundCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      foundCell.add_class('admin-table__cell');
      foundCell.add(new StringControl({ 
        context: this.context, 
        text: (crawl.urlsFound || 0).toLocaleString() 
      }));
      row.add(foundCell);
      
      // Processed
      const processedCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      processedCell.add_class('admin-table__cell');
      processedCell.add(new StringControl({ 
        context: this.context, 
        text: (crawl.urlsProcessed || 0).toLocaleString() 
      }));
      row.add(processedCell);
      
      // Duration
      const durationCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      durationCell.add_class('admin-table__cell');
      durationCell.add(new StringControl({ 
        context: this.context, 
        text: formatDuration(crawl.startedAt, crawl.completedAt) 
      }));
      row.add(durationCell);
      
      // Started
      const startedCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      startedCell.add_class('admin-table__cell');
      startedCell.add_class('admin-table__cell--date');
      const startedText = crawl.startedAt 
        ? new Date(crawl.startedAt).toLocaleString() 
        : '-';
      startedCell.add(new StringControl({ context: this.context, text: startedText }));
      row.add(startedCell);
      
      // Actions
      const actionsCell = new jsgui.Control({ context: this.context, tagName: 'td' });
      actionsCell.add_class('admin-table__cell');
      actionsCell.add_class('admin-table__cell--actions');
      
      const actionsWrapper = new jsgui.Control({ context: this.context, tagName: 'div' });
      actionsWrapper.add_class('action-buttons');
      
      if (crawl.status === 'running' || crawl.status === 'pending') {
        const stopBtn = new jsgui.Control({ context: this.context, tagName: 'button' });
        stopBtn.add_class('btn');
        stopBtn.add_class('btn--sm');
        stopBtn.add_class('btn--danger');
        stopBtn.dom.attributes.type = 'button';
        stopBtn.dom.attributes['data-action'] = 'stop-crawl';
        stopBtn.dom.attributes['data-crawl-id'] = String(crawl.id);
        stopBtn.add(new StringControl({ context: this.context, text: '🛑 Stop' }));
        actionsWrapper.add(stopBtn);
      }
      
      actionsCell.add(actionsWrapper);
      row.add(actionsCell);
      
      tbody.add(row);
    }
    
    table.add(tbody);
    this.add(table);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('admin-panel__empty');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add_class('empty-icon');
    icon.add(new StringControl({ context: this.context, text: '🕷️' }));
    empty.add(icon);
    
    const text = new jsgui.Control({ context: this.context, tagName: 'p' });
    text.add(new StringControl({ 
      context: this.context, 
      text: 'No recent crawl jobs.' 
    }));
    empty.add(text);
    
    this.add(empty);
  }
}

module.exports = { CrawlManagementPanel, getStatusClass, getStatusIcon, formatDuration };
