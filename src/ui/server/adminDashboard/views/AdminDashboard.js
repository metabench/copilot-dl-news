'use strict';

/**
 * AdminDashboard - Main dashboard view combining all panels
 * 
 * Server-side rendered jsgui3 view showing:
 * - Overview summary cards
 * - System health
 * - User management (collapsed by default)
 * - Crawl management
 * - Audit log
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

const { UserManagementPanel } = require('../controls/UserManagementPanel');
const { SystemHealthPanel } = require('../controls/SystemHealthPanel');
const { AuditLogPanel } = require('../controls/AuditLogPanel');
const { CrawlManagementPanel } = require('../controls/CrawlManagementPanel');

/**
 * Summary card control
 */
class SummaryCard extends jsgui.Control {
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    this.icon = spec.icon || '📊';
    this.value = spec.value ?? '-';
    this.label = spec.label || '';
    this.variant = spec.variant || 'default';
    this.href = spec.href || null;
    
    this.add_class('summary-card');
    if (this.variant !== 'default') {
      this.add_class(`summary-card--${this.variant}`);
    }
    
    this._compose();
  }

  _compose() {
    const icon = new jsgui.Control({ context: this.context, tagName: 'div' });
    icon.add_class('summary-card__icon');
    icon.add(new StringControl({ context: this.context, text: this.icon }));
    this.add(icon);

    const value = new jsgui.Control({ context: this.context, tagName: 'div' });
    value.add_class('summary-card__value');
    
    if (this.href) {
      const link = new jsgui.Control({ context: this.context, tagName: 'a' });
      link.dom.attributes.href = this.href;
      link.add(new StringControl({ context: this.context, text: String(this.value) }));
      value.add(link);
    } else {
      value.add(new StringControl({ context: this.context, text: String(this.value) }));
    }
    this.add(value);

    const label = new jsgui.Control({ context: this.context, tagName: 'div' });
    label.add_class('summary-card__label');
    label.add(new StringControl({ context: this.context, text: this.label }));
    this.add(label);
  }
}

class AdminDashboard extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.health - System health data
   * @param {Object} spec.users - User list data { users, total }
   * @param {Object} spec.audit - Audit log data { entries, total }
   * @param {Array} spec.crawls - Crawl jobs list
   * @param {Object} spec.crawlStats - Crawl statistics
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.health = spec.health || {};
    this.users = spec.users || { users: [], total: 0 };
    this.audit = spec.audit || { entries: [], total: 0 };
    this.crawls = spec.crawls || [];
    this.crawlStats = spec.crawlStats || {};
    
    this.add_class('admin-dashboard');
    this._compose();
  }

  _compose() {
    // Overview summary cards
    this._composeSummary();
    
    // Main content grid
    const grid = new jsgui.Control({ context: this.context, tagName: 'div' });
    grid.add_class('admin-dashboard__grid');
    
    // Left column
    const leftCol = new jsgui.Control({ context: this.context, tagName: 'div' });
    leftCol.add_class('admin-dashboard__col');
    
    // System health
    leftCol.add(new SystemHealthPanel({
      context: this.context,
      health: this.health
    }));
    
    // Crawl management
    leftCol.add(new CrawlManagementPanel({
      context: this.context,
      crawls: this.crawls,
      stats: this.crawlStats
    }));
    
    grid.add(leftCol);
    
    // Right column
    const rightCol = new jsgui.Control({ context: this.context, tagName: 'div' });
    rightCol.add_class('admin-dashboard__col');
    
    // Users (compact view)
    rightCol.add(new UserManagementPanel({
      context: this.context,
      users: this.users.users.slice(0, 10), // Show first 10
      total: this.users.total,
      limit: 10
    }));
    
    // Audit log (compact view)
    rightCol.add(new AuditLogPanel({
      context: this.context,
      entries: this.audit.entries.slice(0, 10), // Show first 10
      total: this.audit.total,
      limit: 10
    }));
    
    grid.add(rightCol);
    
    this.add(grid);
  }

  _composeSummary() {
    const summary = new jsgui.Control({ context: this.context, tagName: 'div' });
    summary.add_class('admin-dashboard__summary');
    
    const users = this.health.users || {};
    const sessions = this.health.sessions || {};
    const crawls = this.crawlStats || {};
    
    summary.add(new SummaryCard({
      context: this.context,
      icon: '👥',
      value: (users.total || 0).toLocaleString(),
      label: 'Total Users',
      href: '/admin/users'
    }));
    
    summary.add(new SummaryCard({
      context: this.context,
      icon: '✅',
      value: (users.active || 0).toLocaleString(),
      label: 'Active Users',
      variant: 'success'
    }));
    
    summary.add(new SummaryCard({
      context: this.context,
      icon: '🔐',
      value: (sessions.active || 0).toLocaleString(),
      label: 'Active Sessions'
    }));
    
    summary.add(new SummaryCard({
      context: this.context,
      icon: '🕷️',
      value: (crawls.today || 0).toLocaleString(),
      label: 'Crawls Today',
      href: '/admin/crawls'
    }));
    
    if (users.suspended > 0) {
      summary.add(new SummaryCard({
        context: this.context,
        icon: '🚫',
        value: (users.suspended || 0).toLocaleString(),
        label: 'Suspended Users',
        variant: 'danger'
      }));
    }
    
    this.add(summary);
  }
}

module.exports = { AdminDashboard, SummaryCard };
