'use strict';

/**
 * AuditLogPanel - Searchable/filterable audit log display
 * 
 * Shows admin actions with filtering by action type and pagination.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

/**
 * Get action badge class
 * @param {string} action - Action type
 * @returns {string} CSS class suffix
 */
function getActionClass(action) {
  if (action.includes('suspend')) return 'danger';
  if (action.includes('unsuspend')) return 'success';
  if (action.includes('role')) return 'warning';
  if (action.includes('config')) return 'info';
  if (action.includes('crawl')) return 'primary';
  return 'default';
}

/**
 * Get action icon
 * @param {string} action - Action type
 * @returns {string} Emoji icon
 */
function getActionIcon(action) {
  if (action === 'user_suspended') return '🚫';
  if (action === 'user_unsuspended') return '✅';
  if (action === 'role_changed') return '🔄';
  if (action === 'config_updated') return '⚙️';
  if (action === 'crawl_started') return '🕷️';
  if (action === 'crawl_stopped') return '🛑';
  if (action === 'user_deleted') return '🗑️';
  if (action === 'system_maintenance') return '🔧';
  return '📝';
}

/**
 * Format action for display
 * @param {string} action - Action type
 * @returns {string} Human-readable action
 */
function formatAction(action) {
  return action
    .replace(/_/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Format relative time
 * @param {string} dateStr - ISO date string
 * @returns {string} Relative time
 */
function formatRelativeTime(dateStr) {
  if (!dateStr) return '-';
  
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Just now';
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  
  return date.toLocaleDateString();
}

class AuditLogPanel extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Array} spec.entries - Array of audit log entries
   * @param {number} spec.total - Total entry count
   * @param {string} [spec.action] - Current action filter
   * @param {number} [spec.offset=0] - Current offset
   * @param {number} [spec.limit=50] - Page size
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.entries = spec.entries || [];
    this.total = spec.total || 0;
    this.action = spec.action || '';
    this.offset = spec.offset || 0;
    this.limit = spec.limit || 50;
    
    this.add_class('admin-panel');
    this.add_class('audit-log-panel');
    this._compose();
  }

  _compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: 'div' });
    header.add_class('admin-panel__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h2' });
    title.add_class('admin-panel__title');
    title.add(new StringControl({ context: this.context, text: '📋 Audit Log' }));
    header.add(title);
    
    const stats = new jsgui.Control({ context: this.context, tagName: 'span' });
    stats.add_class('admin-panel__stats');
    stats.add(new StringControl({ context: this.context, text: `${this.total} entries` }));
    header.add(stats);
    
    this.add(header);
    
    // Filter form
    this._composeFilters();
    
    // Entries list
    this._composeEntries();
    
    // Pagination
    if (this.total > this.limit) {
      this._composePagination();
    }
  }

  _composeFilters() {
    const form = new jsgui.Control({ context: this.context, tagName: 'form' });
    form.add_class('audit-log__filters');
    form.dom.attributes.method = 'GET';
    form.dom.attributes.action = '/admin/audit';
    
    const select = new jsgui.Control({ context: this.context, tagName: 'select' });
    select.dom.attributes.name = 'action';
    select.add_class('form-select');
    
    const defaultOpt = new jsgui.Control({ context: this.context, tagName: 'option' });
    defaultOpt.dom.attributes.value = '';
    defaultOpt.add(new StringControl({ context: this.context, text: 'All actions' }));
    select.add(defaultOpt);
    
    const actions = [
      'user_suspended',
      'user_unsuspended',
      'role_changed',
      'config_updated',
      'crawl_started',
      'crawl_stopped',
      'user_deleted',
      'system_maintenance'
    ];
    
    for (const action of actions) {
      const opt = new jsgui.Control({ context: this.context, tagName: 'option' });
      opt.dom.attributes.value = action;
      if (action === this.action) {
        opt.dom.attributes.selected = 'selected';
      }
      opt.add(new StringControl({ context: this.context, text: `${getActionIcon(action)} ${formatAction(action)}` }));
      select.add(opt);
    }
    
    form.add(select);
    
    const btn = new jsgui.Control({ context: this.context, tagName: 'button' });
    btn.dom.attributes.type = 'submit';
    btn.add_class('btn');
    btn.add_class('btn--primary');
    btn.add(new StringControl({ context: this.context, text: 'Filter' }));
    form.add(btn);
    
    this.add(form);
  }

  _composeEntries() {
    if (this.entries.length === 0) {
      this._composeEmpty();
      return;
    }
    
    const list = new jsgui.Control({ context: this.context, tagName: 'div' });
    list.add_class('audit-log__list');
    
    for (const entry of this.entries) {
      const item = new jsgui.Control({ context: this.context, tagName: 'div' });
      item.add_class('audit-log__entry');
      item.add_class(`audit-log__entry--${getActionClass(entry.action)}`);
      
      // Icon
      const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
      icon.add_class('audit-log__icon');
      icon.add(new StringControl({ context: this.context, text: getActionIcon(entry.action) }));
      item.add(icon);
      
      // Content
      const content = new jsgui.Control({ context: this.context, tagName: 'div' });
      content.add_class('audit-log__content');
      
      // Action line
      const actionLine = new jsgui.Control({ context: this.context, tagName: 'div' });
      actionLine.add_class('audit-log__action');
      
      const actionBadge = new jsgui.Control({ context: this.context, tagName: 'span' });
      actionBadge.add_class('badge');
      actionBadge.add_class(`badge--${getActionClass(entry.action)}`);
      actionBadge.add(new StringControl({ context: this.context, text: formatAction(entry.action) }));
      actionLine.add(actionBadge);
      
      if (entry.targetType && entry.targetId) {
        const target = new jsgui.Control({ context: this.context, tagName: 'span' });
        target.add_class('audit-log__target');
        target.add(new StringControl({ 
          context: this.context, 
          text: ` → ${entry.targetType} #${entry.targetId}` 
        }));
        actionLine.add(target);
      }
      
      content.add(actionLine);
      
      // Admin line
      const adminLine = new jsgui.Control({ context: this.context, tagName: 'div' });
      adminLine.add_class('audit-log__admin');
      adminLine.add(new StringControl({ 
        context: this.context, 
        text: `by ${entry.adminName || entry.adminEmail || 'Unknown'}` 
      }));
      content.add(adminLine);
      
      // Details
      if (entry.details) {
        const details = new jsgui.Control({ context: this.context, tagName: 'div' });
        details.add_class('audit-log__details');
        
        const detailStr = typeof entry.details === 'object' 
          ? Object.entries(entry.details)
              .filter(([, v]) => v != null)
              .map(([k, v]) => `${k}: ${v}`)
              .join(', ')
          : String(entry.details);
        
        if (detailStr) {
          details.add(new StringControl({ context: this.context, text: detailStr }));
          content.add(details);
        }
      }
      
      item.add(content);
      
      // Timestamp
      const time = new jsgui.Control({ context: this.context, tagName: 'div' });
      time.add_class('audit-log__time');
      time.add(new StringControl({ context: this.context, text: formatRelativeTime(entry.createdAt) }));
      time.dom.attributes.title = entry.createdAt;
      item.add(time);
      
      list.add(item);
    }
    
    this.add(list);
  }

  _composeEmpty() {
    const empty = new jsgui.Control({ context: this.context, tagName: 'div' });
    empty.add_class('admin-panel__empty');
    
    const icon = new jsgui.Control({ context: this.context, tagName: 'span' });
    icon.add_class('empty-icon');
    icon.add(new StringControl({ context: this.context, text: '📋' }));
    empty.add(icon);
    
    const text = new jsgui.Control({ context: this.context, tagName: 'p' });
    text.add(new StringControl({ 
      context: this.context, 
      text: this.action ? 'No audit entries match this filter.' : 'No audit entries yet.' 
    }));
    empty.add(text);
    
    this.add(empty);
  }

  _composePagination() {
    const pagination = new jsgui.Control({ context: this.context, tagName: 'div' });
    pagination.add_class('pagination');
    
    const currentPage = Math.floor(this.offset / this.limit) + 1;
    const totalPages = Math.ceil(this.total / this.limit);
    
    const actionParam = this.action ? `&action=${encodeURIComponent(this.action)}` : '';
    
    if (currentPage > 1) {
      const prevBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
      const prevOffset = Math.max(0, this.offset - this.limit);
      prevBtn.dom.attributes.href = `/admin/audit?offset=${prevOffset}${actionParam}`;
      prevBtn.add_class('pagination__btn');
      prevBtn.add(new StringControl({ context: this.context, text: '← Previous' }));
      pagination.add(prevBtn);
    }
    
    const info = new jsgui.Control({ context: this.context, tagName: 'span' });
    info.add_class('pagination__info');
    info.add(new StringControl({ context: this.context, text: `Page ${currentPage} of ${totalPages}` }));
    pagination.add(info);
    
    if (currentPage < totalPages) {
      const nextBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
      const nextOffset = this.offset + this.limit;
      nextBtn.dom.attributes.href = `/admin/audit?offset=${nextOffset}${actionParam}`;
      nextBtn.add_class('pagination__btn');
      nextBtn.add(new StringControl({ context: this.context, text: 'Next →' }));
      pagination.add(nextBtn);
    }
    
    this.add(pagination);
  }
}

module.exports = { AuditLogPanel, getActionClass, getActionIcon, formatAction, formatRelativeTime };
