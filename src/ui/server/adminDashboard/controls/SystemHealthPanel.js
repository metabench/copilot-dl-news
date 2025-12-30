'use strict';

/**
 * SystemHealthPanel - CPU, memory, and database health display
 * 
 * Shows real-time system metrics with visual gauges and stats.
 */

const jsgui = require('jsgui3-html');
const StringControl = jsgui.String_Control;

/**
 * Format bytes to human-readable string
 * @param {number|string} bytes - Bytes or pre-formatted string
 * @returns {string}
 */
function formatBytes(bytes) {
  // If already a string (pre-formatted), return as-is
  if (typeof bytes === 'string') {
    return bytes;
  }
  
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let unitIndex = 0;
  let size = bytes;
  
  while (size >= 1024 && unitIndex < units.length - 1) {
    size /= 1024;
    unitIndex++;
  }
  
  return `${size.toFixed(1)} ${units[unitIndex]}`;
}

/**
 * Format uptime seconds to human-readable string
 * @param {number} seconds - Uptime in seconds
 * @returns {string}
 */
function formatUptime(seconds) {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  
  return parts.length > 0 ? parts.join(' ') : '< 1m';
}

/**
 * Get gauge color based on percentage
 * @param {number} percent - Usage percentage
 * @returns {string} Color class
 */
function getGaugeClass(percent) {
  if (percent >= 90) return 'critical';
  if (percent >= 70) return 'warning';
  return 'healthy';
}

class SystemHealthPanel extends jsgui.Control {
  /**
   * @param {Object} spec - Control specification
   * @param {Object} spec.health - System health data from AdminService.getSystemHealth()
   */
  constructor(spec = {}) {
    super({ ...spec, tagName: 'div' });
    
    this.health = spec.health || {};
    
    this.add_class('admin-panel');
    this.add_class('system-health-panel');
    this._compose();
  }

  _compose() {
    // Header
    const header = new jsgui.Control({ context: this.context, tagName: 'div' });
    header.add_class('admin-panel__header');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h2' });
    title.add_class('admin-panel__title');
    title.add(new StringControl({ context: this.context, text: '💻 System Health' }));
    header.add(title);
    
    const refreshBtn = new jsgui.Control({ context: this.context, tagName: 'a' });
    refreshBtn.dom.attributes.href = '/admin';
    refreshBtn.add_class('btn');
    refreshBtn.add_class('btn--sm');
    refreshBtn.add(new StringControl({ context: this.context, text: '🔄 Refresh' }));
    header.add(refreshBtn);
    
    this.add(header);
    
    // Gauges row
    const gauges = new jsgui.Control({ context: this.context, tagName: 'div' });
    gauges.add_class('health-gauges');
    
    // CPU gauge
    this._composeGauge(gauges, {
      icon: '⚡',
      label: 'CPU Usage',
      value: this.health.cpu?.usage || 0,
      unit: '%',
      subtitle: `${this.health.cpu?.cores || 0} cores`
    });
    
    // Memory gauge
    const memPercent = parseFloat(this.health.memory?.usagePercent || 0);
    this._composeGauge(gauges, {
      icon: '🧠',
      label: 'Memory',
      value: memPercent,
      unit: '%',
      subtitle: `${formatBytes(this.health.memory?.used || 0)} / ${formatBytes(this.health.memory?.total || 0)}`
    });
    
    // Process memory gauge
    const heapPercent = this.health.process?.heapTotal 
      ? ((this.health.process.heapUsed / this.health.process.heapTotal) * 100).toFixed(1)
      : 0;
    this._composeGauge(gauges, {
      icon: '📦',
      label: 'Node Heap',
      value: parseFloat(heapPercent),
      unit: '%',
      subtitle: `${formatBytes(this.health.process?.heapUsed || 0)} / ${formatBytes(this.health.process?.heapTotal || 0)}`
    });
    
    this.add(gauges);
    
    // Stats grid
    const statsGrid = new jsgui.Control({ context: this.context, tagName: 'div' });
    statsGrid.add_class('health-stats-grid');
    
    // Uptime
    this._composeStatCard(statsGrid, {
      icon: '⏱️',
      label: 'System Uptime',
      value: formatUptime(this.health.uptime?.system || 0)
    });
    
    this._composeStatCard(statsGrid, {
      icon: '🔄',
      label: 'Process Uptime',
      value: formatUptime(this.health.uptime?.process || 0)
    });
    
    // Platform
    this._composeStatCard(statsGrid, {
      icon: '💿',
      label: 'Platform',
      value: `${this.health.platform?.type || 'Unknown'} ${this.health.platform?.arch || ''}`
    });
    
    this._composeStatCard(statsGrid, {
      icon: '🖥️',
      label: 'Hostname',
      value: this.health.platform?.hostname || 'Unknown'
    });
    
    this.add(statsGrid);
    
    // Database stats
    this._composeDbStats();
  }

  _composeGauge(container, { icon, label, value, unit, subtitle }) {
    const gauge = new jsgui.Control({ context: this.context, tagName: 'div' });
    gauge.add_class('health-gauge');
    gauge.add_class(`health-gauge--${getGaugeClass(value)}`);
    
    const iconEl = new jsgui.Control({ context: this.context, tagName: 'div' });
    iconEl.add_class('health-gauge__icon');
    iconEl.add(new StringControl({ context: this.context, text: icon }));
    gauge.add(iconEl);
    
    const valueEl = new jsgui.Control({ context: this.context, tagName: 'div' });
    valueEl.add_class('health-gauge__value');
    valueEl.add(new StringControl({ context: this.context, text: `${value}${unit}` }));
    gauge.add(valueEl);
    
    const labelEl = new jsgui.Control({ context: this.context, tagName: 'div' });
    labelEl.add_class('health-gauge__label');
    labelEl.add(new StringControl({ context: this.context, text: label }));
    gauge.add(labelEl);
    
    if (subtitle) {
      const subEl = new jsgui.Control({ context: this.context, tagName: 'div' });
      subEl.add_class('health-gauge__subtitle');
      subEl.add(new StringControl({ context: this.context, text: subtitle }));
      gauge.add(subEl);
    }
    
    // Visual bar
    const bar = new jsgui.Control({ context: this.context, tagName: 'div' });
    bar.add_class('health-gauge__bar');
    
    const fill = new jsgui.Control({ context: this.context, tagName: 'div' });
    fill.add_class('health-gauge__fill');
    fill.dom.attributes.style = `width: ${Math.min(100, value)}%`;
    bar.add(fill);
    
    gauge.add(bar);
    
    container.add(gauge);
  }

  _composeStatCard(container, { icon, label, value }) {
    const card = new jsgui.Control({ context: this.context, tagName: 'div' });
    card.add_class('health-stat-card');
    
    const iconEl = new jsgui.Control({ context: this.context, tagName: 'span' });
    iconEl.add_class('health-stat-card__icon');
    iconEl.add(new StringControl({ context: this.context, text: icon }));
    card.add(iconEl);
    
    const content = new jsgui.Control({ context: this.context, tagName: 'div' });
    content.add_class('health-stat-card__content');
    
    const labelEl = new jsgui.Control({ context: this.context, tagName: 'div' });
    labelEl.add_class('health-stat-card__label');
    labelEl.add(new StringControl({ context: this.context, text: label }));
    content.add(labelEl);
    
    const valueEl = new jsgui.Control({ context: this.context, tagName: 'div' });
    valueEl.add_class('health-stat-card__value');
    valueEl.add(new StringControl({ context: this.context, text: String(value) }));
    content.add(valueEl);
    
    card.add(content);
    container.add(card);
  }

  _composeDbStats() {
    const section = new jsgui.Control({ context: this.context, tagName: 'div' });
    section.add_class('health-section');
    
    const title = new jsgui.Control({ context: this.context, tagName: 'h3' });
    title.add_class('health-section__title');
    title.add(new StringControl({ context: this.context, text: '📊 Database Stats' }));
    section.add(title);
    
    const grid = new jsgui.Control({ context: this.context, tagName: 'div' });
    grid.add_class('health-stats-grid');
    
    const db = this.health.database || {};
    const users = this.health.users || {};
    const sessions = this.health.sessions || {};
    
    this._composeStatCard(grid, {
      icon: '🔗',
      label: 'URLs',
      value: (db.urls || 0).toLocaleString()
    });
    
    this._composeStatCard(grid, {
      icon: '📥',
      label: 'Responses',
      value: (db.responses || 0).toLocaleString()
    });
    
    this._composeStatCard(grid, {
      icon: '📝',
      label: 'Analyses',
      value: (db.analyses || 0).toLocaleString()
    });
    
    this._composeStatCard(grid, {
      icon: '👥',
      label: 'Total Users',
      value: (users.total || 0).toLocaleString()
    });
    
    this._composeStatCard(grid, {
      icon: '✅',
      label: 'Active Users',
      value: (users.active || 0).toLocaleString()
    });
    
    this._composeStatCard(grid, {
      icon: '🔐',
      label: 'Active Sessions',
      value: (sessions.active || 0).toLocaleString()
    });
    
    section.add(grid);
    this.add(section);
  }
}

module.exports = { SystemHealthPanel, formatBytes, formatUptime, getGaugeClass };
