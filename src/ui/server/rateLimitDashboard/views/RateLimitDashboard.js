'use strict';

const jsgui = require('jsgui3-html');
const { Control } = jsgui;

/**
 * RateLimitDashboard - Main dashboard view
 * 
 * Renders the complete rate limit monitoring dashboard with:
 * - Header with title and description
 * - Metrics summary row (domains tracked, rate limits, throttled)
 * - Throttled domains warning panel (if any)
 * - Full domain list with intervals and actions
 */
class RateLimitDashboard extends Control {
  constructor(spec = {}) {
    super(spec);
    
    this.metrics = spec.metrics || {
      totalRequests: 0,
      totalRateLimits: 0,
      totalFailures: 0,
      domainsTracked: 0
    };
    this.domains = spec.domains || [];
    this.throttled = spec.throttled || [];
  }

  all_html_render() {
    const metricsHtml = this._renderMetrics();
    const throttledHtml = this._renderThrottled();
    const domainsHtml = this._renderDomainTable();

    return `
      <nav class="hub-nav">
        <a href="http://localhost:3000" class="hub-nav__link">← Back to Ops Hub</a>
      </nav>
      
      <header class="dashboard-header">
        <h1 class="dashboard-header__title">⏱️ Rate Limit Dashboard</h1>
        <p class="dashboard-header__subtitle">Monitor and manage crawler rate limits per domain</p>
      </header>
      
      <main class="dashboard-main">
        ${metricsHtml}
        ${throttledHtml}
        ${domainsHtml}
      </main>
    `;
  }

  _renderMetrics() {
    const { totalRequests, totalRateLimits, totalFailures, domainsTracked } = this.metrics;
    const throttledCount = this.throttled.length;
    
    // Calculate rate limit percentage
    const rateLimitPct = totalRequests > 0 
      ? ((totalRateLimits / totalRequests) * 100).toFixed(1)
      : '0.0';

    return `
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-card__value">${domainsTracked}</div>
          <div class="metric-card__label">Domains Tracked</div>
        </div>
        <div class="metric-card metric-card--success">
          <div class="metric-card__value">${this._formatNumber(totalRequests)}</div>
          <div class="metric-card__label">Total Requests</div>
        </div>
        <div class="metric-card metric-card--warning">
          <div class="metric-card__value">${totalRateLimits}</div>
          <div class="metric-card__label">Rate Limits Hit</div>
        </div>
        <div class="metric-card${throttledCount > 0 ? ' metric-card--danger' : ''}">
          <div class="metric-card__value">${throttledCount}</div>
          <div class="metric-card__label">Throttled Now</div>
        </div>
        <div class="metric-card">
          <div class="metric-card__value">${rateLimitPct}%</div>
          <div class="metric-card__label">Rate Limit Rate</div>
        </div>
      </div>
    `;
  }

  _renderThrottled() {
    if (this.throttled.length === 0) {
      return '';
    }

    const items = this.throttled.slice(0, 5).map(d => `
      <div class="throttled-list__item">
        <span class="domain-name">${this._escapeHtml(d.domain)}</span>
        <span>
          <span class="interval-badge interval-badge--severe">${this._formatInterval(d.interval)}ms</span>
          <span style="color: var(--text-muted); margin-left: 8px;">${d.hits} hits</span>
        </span>
      </div>
    `).join('');

    return `
      <div class="panel">
        <h3 class="panel__title">⚠️ Throttled Domains (${this.throttled.length})</h3>
        <div class="throttled-list">
          ${items}
          ${this.throttled.length > 5 ? `<p style="text-align: center; color: var(--text-muted); margin: 12px 0 0;">... and ${this.throttled.length - 5} more</p>` : ''}
        </div>
      </div>
    `;
  }

  _renderDomainTable() {
    if (this.domains.length === 0) {
      return `
        <div class="panel">
          <h3 class="panel__title">📋 All Tracked Domains</h3>
          <div class="empty-state">
            <div class="empty-state__icon">🔍</div>
            <p>No domains tracked yet. Rate limits will appear here during crawling.</p>
          </div>
        </div>
      `;
    }

    const rows = this.domains.map(d => {
      const badgeClass = d.status === 'normal' ? 'interval-badge--normal' 
        : d.status === 'elevated' ? 'interval-badge--elevated' 
        : 'interval-badge--severe';
      
      const lastRequest = d.lastRequest 
        ? this._formatTimeAgo(d.lastRequest)
        : 'Never';

      return `
        <tr>
          <td><span class="domain-name">${this._escapeHtml(d.domain)}</span></td>
          <td><span class="interval-badge ${badgeClass}">${this._formatInterval(d.currentIntervalMs)}ms</span></td>
          <td>${d.rateLimitHits}</td>
          <td>${d.totalRequests || 0}</td>
          <td>${d.consecutiveSuccess}</td>
          <td style="color: var(--text-muted);">${lastRequest}</td>
          <td>
            <button class="btn btn--reset" data-action="reset-domain" data-domain="${this._escapeHtml(d.domain)}">Reset</button>
          </td>
        </tr>
      `;
    }).join('');

    return `
      <div class="panel">
        <h3 class="panel__title">📋 All Tracked Domains (${this.domains.length})</h3>
        <table class="domain-table">
          <thead>
            <tr>
              <th>Domain</th>
              <th>Current Interval</th>
              <th>429 Hits</th>
              <th>Requests</th>
              <th>Success Streak</th>
              <th>Last Request</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            ${rows}
          </tbody>
        </table>
      </div>
      
      <script>
        async function resetDomain(domain) {
          if (!confirm('Reset rate limit for ' + domain + '?')) return;
          
          try {
            const res = await fetch('/api/domains/' + encodeURIComponent(domain) + '/reset', {
              method: 'POST'
            });
            const data = await res.json();
            if (data.success) {
              location.reload();
            } else {
              alert('Error: ' + data.error);
            }
          } catch (err) {
            alert('Failed: ' + err.message);
          }
        }

        // Delegated handler for data-action buttons (standalone mode)
        document.addEventListener('click', function(e) {
          var btn = e.target.closest('[data-action]');
          if (!btn) return;
          if (btn.dataset.action === 'reset-domain' && btn.dataset.domain) {
            e.preventDefault();
            resetDomain(btn.dataset.domain);
          }
        });
      </script>
    `;
  }

  _formatNumber(num) {
    if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
    return num.toString();
  }

  _formatInterval(ms) {
    if (ms >= 60000) return (ms / 1000).toFixed(0) + 's';
    if (ms >= 1000) return (ms / 1000).toFixed(1) + 's';
    return ms.toString();
  }

  _formatTimeAgo(timestamp) {
    const seconds = Math.floor((Date.now() - timestamp) / 1000);
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  }

  _escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}

module.exports = { RateLimitDashboard };
