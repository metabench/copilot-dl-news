'use strict';

/**
 * Rate Limit Dashboard Controls
 * 
 * Reusable UI components for the rate limit dashboard.
 * These can be used independently or composed into larger views.
 */

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * DomainListPanel - Renders a paginated list of domains
 */
class DomainListPanel extends Control {
  constructor(spec = {}) {
    super(spec);
    this.domains = spec.domains || [];
    this.pageSize = spec.pageSize || 25;
    this.currentPage = spec.currentPage || 1;
  }

  all_html_render() {
    const start = (this.currentPage - 1) * this.pageSize;
    const end = start + this.pageSize;
    const pageDomains = this.domains.slice(start, end);
    const totalPages = Math.ceil(this.domains.length / this.pageSize);

    if (pageDomains.length === 0) {
      return `<div class="empty-state">No domains to display</div>`;
    }

    const rows = pageDomains.map(d => this._renderRow(d)).join('');

    return `
      <table class="domain-table">
        <thead>
          <tr>
            <th>Domain</th>
            <th>Interval</th>
            <th>Hits</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${rows}
        </tbody>
      </table>
      ${totalPages > 1 ? this._renderPagination(totalPages) : ''}
    `;
  }

  _renderRow(domain) {
    const status = domain.status || 'normal';
    return `
      <tr>
        <td class="domain-name">${this._escapeHtml(domain.domain)}</td>
        <td><span class="interval-badge interval-badge--${status}">${domain.currentIntervalMs}ms</span></td>
        <td>${domain.rateLimitHits}</td>
        <td>${status}</td>
      </tr>
    `;
  }

  _renderPagination(totalPages) {
    return `
      <div style="text-align: center; padding: 16px; color: var(--text-muted);">
        Page ${this.currentPage} of ${totalPages}
      </div>
    `;
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * DomainDetailCard - Detailed view of a single domain
 */
class DomainDetailCard extends Control {
  constructor(spec = {}) {
    super(spec);
    this.domain = spec.domain || 'unknown';
    this.state = spec.state || {};
  }

  all_html_render() {
    const {
      currentIntervalMs = 1000,
      rateLimitHits = 0,
      totalRequests = 0,
      consecutiveSuccess = 0,
      consecutiveFails = 0,
      lastRequest = null,
      lastRateLimitAt = null
    } = this.state;

    const status = this._getStatus(currentIntervalMs);

    return `
      <div class="panel">
        <h3 class="panel__title">${this._escapeHtml(this.domain)}</h3>
        <div class="detail-grid">
          <div class="detail-item">
            <span class="detail-label">Current Interval</span>
            <span class="interval-badge interval-badge--${status}">${currentIntervalMs}ms</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Rate Limit Hits</span>
            <span class="detail-value">${rateLimitHits}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Total Requests</span>
            <span class="detail-value">${totalRequests}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Success Streak</span>
            <span class="detail-value">${consecutiveSuccess}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Fail Streak</span>
            <span class="detail-value">${consecutiveFails}</span>
          </div>
        </div>
      </div>
    `;
  }

  _getStatus(intervalMs) {
    if (intervalMs <= 1000) return 'normal';
    if (intervalMs <= 5000) return 'elevated';
    return 'severe';
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

/**
 * MetricsSummaryPanel - Summary metrics display
 */
class MetricsSummaryPanel extends Control {
  constructor(spec = {}) {
    super(spec);
    this.metrics = spec.metrics || {};
  }

  all_html_render() {
    const { 
      domainsTracked = 0,
      totalRequests = 0,
      totalRateLimits = 0,
      totalFailures = 0,
      throttledCount = 0
    } = this.metrics;

    return `
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-card__value">${domainsTracked}</div>
          <div class="metric-card__label">Domains</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-card__value">${totalRequests}</div>
          <div class="metric-card__label">Requests</div>
        </div>
        <div class="metric-card metric-card--warning">
          <div class="metric-card__value">${totalRateLimits}</div>
          <div class="metric-card__label">429s</div>
        </div>
        <div class="metric-card${throttledCount > 0 ? ' metric-card--danger' : ''}">
          <div class="metric-card__value">${throttledCount}</div>
          <div class="metric-card__label">Throttled</div>
        </div>
      </div>
    `;
  }
}

/**
 * ThrottledDomainsPanel - Warning panel for throttled domains
 */
class ThrottledDomainsPanel extends Control {
  constructor(spec = {}) {
    super(spec);
    this.domains = spec.domains || [];
    this.maxDisplay = spec.maxDisplay || 10;
  }

  all_html_render() {
    if (this.domains.length === 0) {
      return `
        <div class="panel">
          <h3 class="panel__title">✅ No Throttled Domains</h3>
          <p style="color: var(--text-muted);">All domains are operating at normal intervals.</p>
        </div>
      `;
    }

    const displayDomains = this.domains.slice(0, this.maxDisplay);
    const items = displayDomains.map(d => `
      <div class="throttled-list__item">
        <span class="domain-name">${this._escapeHtml(d.domain)}</span>
        <span class="interval-badge interval-badge--severe">${d.interval}ms</span>
      </div>
    `).join('');

    const overflow = this.domains.length > this.maxDisplay 
      ? `<p style="text-align: center; color: var(--text-muted);">... and ${this.domains.length - this.maxDisplay} more</p>`
      : '';

    return `
      <div class="panel">
        <h3 class="panel__title">⚠️ Throttled Domains (${this.domains.length})</h3>
        <div class="throttled-list">
          ${items}
          ${overflow}
        </div>
      </div>
    `;
  }

  _escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}

module.exports = {
  DomainListPanel,
  DomainDetailCard,
  MetricsSummaryPanel,
  ThrottledDomainsPanel
};
